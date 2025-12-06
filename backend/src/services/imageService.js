/**
 * 图片服务
 * 通义万相图片生成
 */
const axios = require('axios');
const logger = require('../config/logger');
const { dashscopeConfig } = require('../config/aliyun');
const { ImageLibrary } = require('../models');
const { transferToCdn, validateStorageConfig } = require('./storageService');

// 检查 OSS 配置是否有效（非占位符）
function isOssConfigValid() {
  const bucket = process.env.OSS_BUCKET;
  return bucket && bucket !== 'your_bucket_name' && bucket !== '';
}

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
    style = '<photography>',
    size = '1024*1024'
  } = options;

  const prompt = `一道精美的中餐${dishName}，摆盘精致，光线柔和，高清美食摄影风格，白色瓷盘，木质桌面背景`;

  logger.info(`[Image] 开始创建图片任务: ${dishName}`);
  logger.info(`[Image] API URL: ${WANXIANG_API_URL}`);
  logger.info(`[Image] Model: ${WANXIANG_MODEL}`);
  logger.info(`[Image] Prompt: ${prompt}`);

  try {
    const requestData = {
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
    };
    logger.debug(`[Image] 请求数据:`, JSON.stringify(requestData, null, 2));

    const response = await axios.post(WANXIANG_API_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${dashscopeConfig.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable' // 异步任务
      },
      timeout: 30000 // 增加到30秒
    });

    logger.info(`[Image] API响应状态: ${response.status}`);
    logger.debug(`[Image] API响应数据:`, JSON.stringify(response.data, null, 2));

    const taskId = response.data.output?.task_id;
    if (!taskId) {
      logger.error(`[Image] 未获取到任务ID，响应:`, response.data);
      throw new Error('未获取到任务ID');
    }

    logger.info(`[Image] 图片生成任务已创建: ${taskId} for ${dishName}`);
    return { taskId };
  } catch (error) {
    logger.error(`[Image] 创建图片生成任务失败 (${dishName}):`, error.message);
    if (error.response) {
      logger.error(`[Image] 错误响应状态: ${error.response.status}`);
      logger.error(`[Image] 错误响应数据:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * 查询图片生成任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise<{status: string, imageUrl?: string}>}
 */
async function getTaskStatus(taskId) {
  logger.debug(`[Image] 查询任务状态: ${taskId}`);
  try {
    const url = `${dashscopeConfig.baseUrl}/tasks/${taskId}`;
    logger.debug(`[Image] 状态查询URL: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${dashscopeConfig.apiKey}`
      },
      timeout: 30000 // 增加到30秒
    });

    const output = response.data.output;
    const status = output?.task_status;
    logger.info(`[Image] 任务 ${taskId} 状态: ${status}`);

    if (status === 'SUCCEEDED') {
      const imageUrl = output?.results?.[0]?.url;
      logger.info(`[Image] 任务 ${taskId} 成功，图片URL: ${imageUrl}`);
      return { status: 'completed', imageUrl };
    } else if (status === 'FAILED') {
      logger.error(`[Image] 任务 ${taskId} 失败: ${output?.message}`);
      return { status: 'failed', error: output?.message };
    } else {
      logger.debug(`[Image] 任务 ${taskId} 仍在进行中...`);
      return { status: 'pending' };
    }
  } catch (error) {
    logger.error(`[Image] 查询任务状态失败 (${taskId}):`, error.message);
    if (error.response) {
      logger.error(`[Image] 错误响应状态: ${error.response.status}`);
      logger.error(`[Image] 错误响应数据:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * 等待图片生成完成
 * @param {string} taskId - 任务ID
 * @returns {Promise<string>} 图片URL
 */
async function waitForImage(taskId) {
  logger.info(`[Image] 开始轮询等待图片生成: ${taskId}`);
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    logger.debug(`[Image] 轮询第 ${i + 1}/${MAX_POLL_ATTEMPTS} 次: ${taskId}`);
    try {
      const result = await getTaskStatus(taskId);

      if (result.status === 'completed') {
        logger.info(`[Image] 图片生成完成: ${taskId}`);
        return result.imageUrl;
      } else if (result.status === 'failed') {
        logger.error(`[Image] 图片生成失败: ${taskId}, 原因: ${result.error}`);
        throw new Error(`图片生成失败: ${result.error}`);
      }
    } catch (error) {
      // 如果是超时或网络错误，继续轮询而不是立即失败
      logger.warn(`[Image] 轮询出错，继续尝试: ${taskId}, 错误: ${error.message}`);
    }

    // 等待后再次查询
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  logger.error(`[Image] 图片生成超时: ${taskId}`);
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
  logger.info(`[Image] generateAndSaveImage 开始: ${normalizedDishName}, hash: ${recipeHash}`);

  // 先检查是否已有图片
  const existing = await ImageLibrary.findByNormalizedDishName(normalizedDishName);
  if (existing) {
    logger.info(`[Image] 复用已有图片: ${normalizedDishName}, id: ${existing.id}`);
    return existing;
  }

  // 检查是否有相同hash的图片（防止并发重复生成）
  const byHash = await ImageLibrary.findByRecipeHash(recipeHash);
  if (byHash) {
    logger.info(`[Image] 已有相同hash图片: ${recipeHash}, id: ${byHash.id}`);
    return byHash;
  }

  logger.info(`[Image] 需要生成新图片: ${normalizedDishName}`);

  // 创建图片生成任务
  const { taskId } = await createImageTask(normalizedDishName, options);
  logger.info(`[Image] 任务ID获取成功: ${taskId}`);

  // 先创建占位记录
  const imageRecord = await ImageLibrary.createImage({
    normalizedDishName,
    recipeHash,
    imageUrl: '', // 稍后更新
    ossTempUrl: '',
    ossDownloaded: false
  });
  logger.info(`[Image] 占位记录已创建: id=${imageRecord.id}`);

  // 异步等待图片生成并转存
  logger.info(`[Image] 开始异步等待图片生成...`);
  waitForImage(taskId)
    .then(async (tempUrl) => {
      logger.info(`[Image] 图片生成成功，临时URL: ${tempUrl}`);

      // 检查 OSS 配置是否有效
      if (isOssConfigValid()) {
        // 转存到自有CDN
        logger.info(`[Image] 开始转存到CDN...`);
        try {
          const cdnResult = await transferToCdn(tempUrl, normalizedDishName, recipeHash);
          logger.info(`[Image] CDN转存完成: ${cdnResult.permanentUrl}`);

          // 更新数据库记录
          await ImageLibrary.markDownloaded(
            imageRecord.id,
            cdnResult.permanentUrl,
            cdnResult.hash,
            cdnResult.sizeKb
          );

          logger.info(`[Image] 图片生成并转存完成: ${normalizedDishName}`);
        } catch (cdnError) {
          logger.error(`[Image] CDN转存失败，使用临时URL: ${cdnError.message}`);
          // 降级：使用临时URL（24小时有效）
          await ImageLibrary.markDownloaded(
            imageRecord.id,
            tempUrl,
            '',
            0
          );
          logger.info(`[Image] 降级使用临时URL: ${normalizedDishName}`);
        }
      } else {
        // OSS未配置，直接使用临时URL（24小时有效）
        logger.warn(`[Image] OSS未配置，使用临时URL（24小时有效）: ${normalizedDishName}`);
        await ImageLibrary.markDownloaded(
          imageRecord.id,
          tempUrl,
          '',
          0
        );
        logger.info(`[Image] 图片生成完成（临时URL）: ${normalizedDishName}`);
      }
    })
    .catch(error => {
      logger.error(`[Image] 图片生成失败 ${normalizedDishName}:`, error.message);
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
  logger.info(`[Image] getOrGenerateImage: ${normalizedDishName}`);

  // 1. 查找现有图片
  const existing = await ImageLibrary.findByNormalizedDishName(normalizedDishName);

  if (existing && existing.ossDownloaded) {
    logger.info(`[Image] 找到已完成的图片: ${normalizedDishName}, url: ${existing.imageUrl}`);
    return {
      imageUrl: existing.imageUrl,
      imageId: existing.id,
      isNew: false,
      isPending: false
    };
  }

  // 2. 如果有记录但未转存完成，返回pending状态
  if (existing && !existing.ossDownloaded) {
    logger.info(`[Image] 图片正在生成中: ${normalizedDishName}, id: ${existing.id}`);
    return {
      imageUrl: existing.ossTempUrl || '',
      imageId: existing.id,
      isNew: false,
      isPending: true
    };
  }

  // 3. 没有图片，触发生成
  logger.info(`[Image] 没有找到图片，触发新生成: ${normalizedDishName}`);
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
