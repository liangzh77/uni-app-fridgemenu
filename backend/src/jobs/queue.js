/**
 * BullMQ任务队列配置
 */
const Queue = require('bull');
const logger = require('../config/logger');

// Redis连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// 队列默认配置
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: 100,
  removeOnFail: 50
};

/**
 * 图片生成队列
 */
const imageGenerationQueue = new Queue('image-generation', {
  redis: redisConfig,
  defaultJobOptions
});

/**
 * 图片转存队列
 */
const imageTransferQueue = new Queue('image-transfer', {
  redis: redisConfig,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5
  }
});

// 队列事件监听
imageGenerationQueue.on('completed', (job, result) => {
  logger.info(`图片生成任务完成: ${job.id}`, result);
});

imageGenerationQueue.on('failed', (job, err) => {
  logger.error(`图片生成任务失败: ${job.id}`, err);
});

imageGenerationQueue.on('stalled', (job) => {
  logger.warn(`图片生成任务停滞: ${job.id}`);
});

imageTransferQueue.on('completed', (job, result) => {
  logger.info(`图片转存任务完成: ${job.id}`, result);
});

imageTransferQueue.on('failed', (job, err) => {
  logger.error(`图片转存任务失败: ${job.id}`, err);
});

/**
 * 添加图片生成任务
 * @param {Object} data - 任务数据
 * @param {string} data.normalizedDishName - 规范化菜名
 * @param {string} data.recipeHash - 菜谱哈希
 * @param {number} data.recipeId - 菜谱ID
 * @param {string} data.socketId - WebSocket客户端ID（用于推送进度）
 * @returns {Promise<Job>}
 */
async function addImageGenerationJob(data) {
  const job = await imageGenerationQueue.add('generate', data, {
    jobId: `img_${data.recipeHash}_${Date.now()}`
  });
  logger.info(`添加图片生成任务: ${job.id} for ${data.normalizedDishName}`);
  return job;
}

/**
 * 添加图片转存任务
 * @param {Object} data - 任务数据
 * @param {number} data.imageId - 图片库ID
 * @param {string} data.tempUrl - 临时URL
 * @param {string} data.normalizedDishName - 规范化菜名
 * @param {string} data.recipeHash - 菜谱哈希
 * @returns {Promise<Job>}
 */
async function addImageTransferJob(data) {
  const job = await imageTransferQueue.add('transfer', data, {
    jobId: `transfer_${data.imageId}_${Date.now()}`
  });
  logger.info(`添加图片转存任务: ${job.id}`);
  return job;
}

/**
 * 获取队列状态
 * @returns {Promise<Object>}
 */
async function getQueueStats() {
  const [genWaiting, genActive, genCompleted, genFailed] = await Promise.all([
    imageGenerationQueue.getWaitingCount(),
    imageGenerationQueue.getActiveCount(),
    imageGenerationQueue.getCompletedCount(),
    imageGenerationQueue.getFailedCount()
  ]);

  const [transWaiting, transActive, transCompleted, transFailed] = await Promise.all([
    imageTransferQueue.getWaitingCount(),
    imageTransferQueue.getActiveCount(),
    imageTransferQueue.getCompletedCount(),
    imageTransferQueue.getFailedCount()
  ]);

  return {
    imageGeneration: {
      waiting: genWaiting,
      active: genActive,
      completed: genCompleted,
      failed: genFailed
    },
    imageTransfer: {
      waiting: transWaiting,
      active: transActive,
      completed: transCompleted,
      failed: transFailed
    }
  };
}

/**
 * 清理已完成的任务
 */
async function cleanupQueues() {
  await imageGenerationQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24小时前
  await imageGenerationQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7天前
  await imageTransferQueue.clean(24 * 60 * 60 * 1000, 'completed');
  await imageTransferQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
  logger.info('队列清理完成');
}

/**
 * 关闭队列连接
 */
async function closeQueues() {
  await imageGenerationQueue.close();
  await imageTransferQueue.close();
  logger.info('队列连接已关闭');
}

module.exports = {
  imageGenerationQueue,
  imageTransferQueue,
  addImageGenerationJob,
  addImageTransferJob,
  getQueueStats,
  cleanupQueues,
  closeQueues
};
