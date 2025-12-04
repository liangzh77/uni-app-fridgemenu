/**
 * 图片服务
 * 通义万相图片生成
 */
const axios = require('axios');
const logger = require('../config/logger');
const { dashscopeConfig } = require('../config/aliyun');
const { ImageLibrary } = require('../models');
const { transferToCdn } = require('./storageService');

// 通义万相API配置
const WANXIANG_API_URL = `${dashscopeConfig.baseUrl}/services/aigc/text2image/image-synthesis`;
const WANXIANG_MODEL = dashscopeConfig.wanxiangModel || 'wanx-v1';

// 任务轮询间隔（毫秒）
const POLL_INTERVAL = 2000;
const MAX_POLL_ATTEMPTS = 60; // 最多等待2分钟

/**
 * 生成菜品图片
 * @param {string} dishName - 菜名
 * @param {Object} options - 选项
 * @returns {Promise<{taskId: string}>}
 */
async function createImageTask(dishName, options = {}) {
  const {
    style = 'realistic',
    size = '1024*1024'
  } = options;

  const prompt = `一道精美的中餐${dishName}，摆盘精致，光线柔和，高清美食摄影风格，白色瓷盘，木质桌面背景`;

  try {
    const response = await axios.post(WANXIANG_API_URL, {
      model: WANXIANG_MODEL,
      input: {
        prompt,
        negative_prompt: '低质量，模糊，变形，文字，水印'
      },
      parameters: {
        style,
        size,
        n: 1
      }
    }, {
      headers: {
        'Authorization': `Bearer ${dashscopeConfig.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable' // 异步任务
      },
      timeout: 10000
    });

    const taskId = response.data.output?.task_id;
    if (!taskId) {
      throw new Error('未获取到任务ID');
    }

    logger.info(`图片生成任务已创建: ${taskId} for ${dishName}`);
    return { taskId };
  } catch (error) {
    logger.error('创建图片生成任务失败:', error);
    throw error;
  }
}

/**
 * 查询图片生成任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise<{status: string, imageUrl?: string}>}
 */
async function getTaskStatus(taskId) {
  try {
    const response = await axios.get(`${dashscopeConfig.baseUrl}/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${dashscopeConfig.apiKey}`
      },
      timeout: 10000
    });

    const output = response.data.output;
    const status = output?.task_status;

    if (status === 'SUCCEEDED') {
      const imageUrl = output?.results?.[0]?.url;
      return { status: 'completed', imageUrl };
    } else if (status === 'FAILED') {
      return { status: 'failed', error: output?.message };
    } else {
      return { status: 'pending' };
    }
  } catch (error) {
    logger.error('查询任务状态失败:', error);
    throw error;
  }
}

/**
 * 等待图片生成完成
 * @param {string} taskId - 任务ID
 * @returns {Promise<string>} 图片URL
 */
async function waitForImage(taskId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const result = await getTaskStatus(taskId);

    if (result.status === 'completed') {
      return result.imageUrl;
    } else if (result.status === 'failed') {
      throw new Error(`图片生成失败: ${result.error}`);
    }

    // 等待后再次查询
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error('图片生成超时');
}

/**
 * 为菜谱生成并保存图片
 * @param {string} normalizedDishName - 规范化菜名
 * @param {string} recipeHash - 菜谱哈希
 * @param {Object} options - 选项
 * @returns {Promise<ImageLibrary>}
 */
async function generateAndSaveImage(normalizedDishName, recipeHash, options = {}) {
  // 先检查是否已有图片
  const existing = await ImageLibrary.findByNormalizedDishName(normalizedDishName);
  if (existing) {
    logger.info(`复用已有图片: ${normalizedDishName}`);
    return existing;
  }

  // 检查是否有相同hash的图片（防止并发重复生成）
  const byHash = await ImageLibrary.findByRecipeHash(recipeHash);
  if (byHash) {
    logger.info(`已有相同hash图片: ${recipeHash}`);
    return byHash;
  }

  // 创建图片生成任务
  const { taskId } = await createImageTask(normalizedDishName, options);

  // 先创建占位记录
  const imageRecord = await ImageLibrary.createImage({
    normalizedDishName,
    recipeHash,
    imageUrl: '', // 稍后更新
    ossTempUrl: '',
    ossDownloaded: false
  });

  // 异步等待图片生成并转存
  waitForImage(taskId)
    .then(async (tempUrl) => {
      // 转存到自有CDN
      const cdnResult = await transferToCdn(tempUrl, normalizedDishName, recipeHash);

      // 更新数据库记录
      await ImageLibrary.markDownloaded(
        imageRecord.id,
        cdnResult.permanentUrl,
        cdnResult.hash,
        cdnResult.sizeKb
      );

      logger.info(`图片生成并转存完成: ${normalizedDishName}`);
    })
    .catch(error => {
      logger.error(`图片生成失败 ${normalizedDishName}:`, error);
    });

  return imageRecord;
}

/**
 * 获取或生成菜品图片
 * @param {string} normalizedDishName - 规范化菜名
 * @param {string} recipeHash - 菜谱哈希
 * @returns {Promise<{imageUrl: string, isNew: boolean, isPending: boolean}>}
 */
async function getOrGenerateImage(normalizedDishName, recipeHash) {
  // 1. 查找现有图片
  const existing = await ImageLibrary.findByNormalizedDishName(normalizedDishName);

  if (existing && existing.ossDownloaded) {
    return {
      imageUrl: existing.imageUrl,
      imageId: existing.id,
      isNew: false,
      isPending: false
    };
  }

  // 2. 如果有记录但未转存完成，返回pending状态
  if (existing && !existing.ossDownloaded) {
    return {
      imageUrl: existing.ossTempUrl || '',
      imageId: existing.id,
      isNew: false,
      isPending: true
    };
  }

  // 3. 没有图片，触发生成
  const newImage = await generateAndSaveImage(normalizedDishName, recipeHash);

  return {
    imageUrl: '',
    imageId: newImage.id,
    isNew: true,
    isPending: true
  };
}

module.exports = {
  createImageTask,
  getTaskStatus,
  waitForImage,
  generateAndSaveImage,
  getOrGenerateImage
};
