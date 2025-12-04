/**
 * 图片转存定时任务
 * 将OSS临时URL转存到永久CDN
 */
const cron = require('node-cron');
const { ImageLibrary } = require('../models');
const { transferToCdn } = require('../services/storageService');
const { imageTransferQueue } = require('./queue');
const logger = require('../config/logger');

// 并发控制
const MAX_CONCURRENT = 5;
let isRunning = false;

/**
 * 扫描并转存待处理的图片
 */
async function processTransferQueue() {
  if (isRunning) {
    logger.warn('图片转存任务正在运行中，跳过本次执行');
    return;
  }

  isRunning = true;
  logger.info('开始执行图片转存定时任务');

  try {
    // 查询待转存的图片（已创建但未下载的，且创建时间超过1小时）
    const pendingImages = await ImageLibrary.getPendingDownloads(50);

    if (pendingImages.length === 0) {
      logger.info('没有待转存的图片');
      return;
    }

    logger.info(`发现 ${pendingImages.length} 个待转存图片`);

    // 分批处理
    const batches = [];
    for (let i = 0; i < pendingImages.length; i += MAX_CONCURRENT) {
      batches.push(pendingImages.slice(i, i + MAX_CONCURRENT));
    }

    let successCount = 0;
    let failCount = 0;

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(image => transferSingleImage(image))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
        } else {
          failCount++;
          logger.error(`转存失败: ${batch[index].id}`, result.reason);
        }
      });
    }

    logger.info(`图片转存完成: 成功 ${successCount}, 失败 ${failCount}`);

  } catch (error) {
    logger.error('图片转存任务执行失败:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * 转存单个图片
 * @param {ImageLibrary} image - 图片记录
 * @returns {Promise<boolean>}
 */
async function transferSingleImage(image) {
  try {
    // 如果没有临时URL，跳过
    if (!image.ossTempUrl) {
      logger.warn(`图片 ${image.id} 没有临时URL，跳过`);
      return false;
    }

    // 检查临时URL是否还有效（通过尝试下载前几个字节）
    const axios = require('axios');
    try {
      await axios.head(image.ossTempUrl, { timeout: 5000 });
    } catch (error) {
      if (error.response?.status === 403 || error.response?.status === 404) {
        logger.warn(`图片 ${image.id} 临时URL已过期`);
        // 标记为需要重新生成
        await image.update({ ossTempUrl: null });
        return false;
      }
      throw error;
    }

    // 执行转存
    const result = await transferToCdn(
      image.ossTempUrl,
      image.normalizedDishName,
      image.recipeHash
    );

    // 更新数据库
    await ImageLibrary.markDownloaded(
      image.id,
      result.permanentUrl,
      result.hash,
      result.sizeKb
    );

    logger.info(`图片转存成功: ${image.id} -> ${result.permanentUrl}`);
    return true;

  } catch (error) {
    logger.error(`转存图片 ${image.id} 失败:`, error);
    return false;
  }
}

/**
 * 添加单个图片到转存队列
 * @param {number} imageId - 图片ID
 * @param {string} tempUrl - 临时URL
 * @param {string} normalizedDishName - 规范化菜名
 * @param {string} recipeHash - 菜谱哈希
 */
async function addToTransferQueue(imageId, tempUrl, normalizedDishName, recipeHash) {
  await imageTransferQueue.add('transfer', {
    imageId,
    tempUrl,
    normalizedDishName,
    recipeHash
  });
}

/**
 * 处理转存队列任务
 */
imageTransferQueue.process('transfer', async (job) => {
  const { imageId, tempUrl, normalizedDishName, recipeHash } = job.data;

  logger.info(`处理转存任务: ${job.id} - ${imageId}`);

  try {
    const result = await transferToCdn(tempUrl, normalizedDishName, recipeHash);

    await ImageLibrary.markDownloaded(
      imageId,
      result.permanentUrl,
      result.hash,
      result.sizeKb
    );

    return { success: true, imageUrl: result.permanentUrl };
  } catch (error) {
    logger.error(`转存任务失败: ${job.id}`, error);
    throw error;
  }
});

/**
 * 启动定时任务
 */
function startScheduler() {
  // 每小时执行一次
  cron.schedule('0 * * * *', () => {
    processTransferQueue();
  });

  // 每天凌晨3点清理不活跃图片
  cron.schedule('0 3 * * *', async () => {
    try {
      const deleted = await ImageLibrary.cleanupInactive(90);
      logger.info(`清理了 ${deleted} 张不活跃图片`);
    } catch (error) {
      logger.error('清理不活跃图片失败:', error);
    }
  });

  logger.info('图片转存定时任务已启动');
}

/**
 * 手动触发转存任务（用于管理接口）
 */
async function triggerManualTransfer() {
  return processTransferQueue();
}

module.exports = {
  processTransferQueue,
  addToTransferQueue,
  startScheduler,
  triggerManualTransfer
};
