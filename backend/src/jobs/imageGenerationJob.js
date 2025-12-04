/**
 * 图片生成任务处理器
 */
const { imageGenerationQueue } = require('./queue');
const { ImageLibrary } = require('../models');
const { createImageTask, waitForImage } = require('../services/imageService');
const { transferToCdn } = require('../services/storageService');
const { emitImageProgress } = require('../services/socketService');
const logger = require('../config/logger');

/**
 * 处理图片生成任务
 */
imageGenerationQueue.process('generate', async (job) => {
  const { normalizedDishName, recipeHash, recipeId, socketId } = job.data;

  logger.info(`开始处理图片生成任务: ${job.id} - ${normalizedDishName}`);

  try {
    // 1. 检查是否已有图片（防止重复生成）
    const existing = await ImageLibrary.findByNormalizedDishName(normalizedDishName);
    if (existing && existing.ossDownloaded) {
      logger.info(`图片已存在，复用: ${normalizedDishName}`);
      emitImageProgress(socketId, recipeId, 'completed', existing.imageUrl);
      return {
        success: true,
        reused: true,
        imageUrl: existing.imageUrl,
        imageId: existing.id
      };
    }

    // 2. 通知开始处理
    emitImageProgress(socketId, recipeId, 'processing');
    await job.progress(10);

    // 3. 检查是否有相同hash的记录（并发控制）
    const byHash = await ImageLibrary.findByRecipeHash(recipeHash);
    if (byHash) {
      if (byHash.ossDownloaded) {
        emitImageProgress(socketId, recipeId, 'completed', byHash.imageUrl);
        return {
          success: true,
          reused: true,
          imageUrl: byHash.imageUrl,
          imageId: byHash.id
        };
      }
      // 如果存在但未完成，等待其完成
      logger.info(`发现相同hash的任务正在处理，等待: ${recipeHash}`);
    }

    // 4. 创建或获取图片记录
    let imageRecord = byHash;
    if (!imageRecord) {
      imageRecord = await ImageLibrary.createImage({
        normalizedDishName,
        recipeHash,
        imageUrl: '',
        ossDownloaded: false
      });
    }

    await job.progress(20);

    // 5. 调用AI生成图片
    logger.info(`调用通义万相生成图片: ${normalizedDishName}`);
    const { taskId } = await createImageTask(normalizedDishName);

    await job.progress(40);

    // 6. 等待图片生成完成
    const tempUrl = await waitForImage(taskId);
    logger.info(`图片生成完成: ${tempUrl}`);

    await job.progress(60);

    // 7. 转存到CDN
    logger.info(`开始转存图片到CDN: ${normalizedDishName}`);
    const cdnResult = await transferToCdn(tempUrl, normalizedDishName, recipeHash);

    await job.progress(80);

    // 8. 更新数据库记录
    await ImageLibrary.markDownloaded(
      imageRecord.id,
      cdnResult.permanentUrl,
      cdnResult.hash,
      cdnResult.sizeKb
    );

    await job.progress(100);

    // 9. 通知完成
    emitImageProgress(socketId, recipeId, 'completed', cdnResult.permanentUrl);

    logger.info(`图片生成任务完成: ${normalizedDishName}`);

    return {
      success: true,
      reused: false,
      imageUrl: cdnResult.permanentUrl,
      imageId: imageRecord.id,
      sizeKb: cdnResult.sizeKb
    };

  } catch (error) {
    logger.error(`图片生成任务失败: ${job.id}`, error);

    // 通知失败
    emitImageProgress(socketId, recipeId, 'failed');

    throw error;
  }
});

/**
 * 批量添加图片生成任务
 * @param {Array} recipes - 菜谱列表
 * @param {string} socketId - WebSocket客户端ID
 * @returns {Promise<Array>} 任务ID列表
 */
async function batchAddImageJobs(recipes, socketId) {
  const jobs = [];

  for (const recipe of recipes) {
    // 先检查是否需要生成
    if (recipe.imageUrl && !recipe.imagePending) {
      continue;
    }

    const job = await imageGenerationQueue.add('generate', {
      normalizedDishName: recipe.normalizedDishName || recipe.dishName,
      recipeHash: recipe.recipeHash,
      recipeId: recipe.id,
      socketId
    }, {
      jobId: `img_${recipe.recipeHash}_${Date.now()}`,
      priority: 1
    });

    jobs.push({
      jobId: job.id,
      recipeId: recipe.id
    });
  }

  logger.info(`批量添加 ${jobs.length} 个图片生成任务`);
  return jobs;
}

module.exports = {
  batchAddImageJobs
};
