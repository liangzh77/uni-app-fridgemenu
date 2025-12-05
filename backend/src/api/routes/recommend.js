/**
 * 菜谱推荐相关API路由
 */
const express = require('express');
const router = express.Router();
const { getRecommendations, refreshRecommendations, checkImageStatus, batchCheckImageStatus } = require('../../services/recipeService');
const { aiLimiter } = require('../middleware/rateLimit');
const logger = require('../../config/logger');

/**
 * POST /api/recommend
 * 获取菜谱推荐（分批返回）
 * 首次调用返回前3个，后续通过 batchIndex 获取更多
 */
router.post('/', aiLimiter, async (req, res, next) => {
  try {
    const { userId, sessionId, batchIndex = 0, preferences } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const result = await getRecommendations(userId, sessionId, {
      batchIndex,
      preferences
    });

    logger.info(`用户 ${userId} 获取推荐，批次 ${result.batchIndex}/${result.totalBatches}，${result.recipes.length} 个菜谱，缓存: ${result.fromCache}，循环: ${result.isLooping}`);

    res.json({
      success: true,
      data: {
        recipes: result.recipes,
        batchIndex: result.batchIndex,
        totalBatches: result.totalBatches,
        totalRecipes: result.totalRecipes,
        hasMore: result.hasMore,
        fromCache: result.fromCache,
        isLooping: result.isLooping
      },
      message: result.isLooping ? `已循环推荐 ${result.recipes.length} 道菜谱` : `已推荐 ${result.recipes.length} 道菜谱`
    });
  } catch (error) {
    if (error.message === '请先添加食材') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

/**
 * POST /api/recommend/refresh
 * 刷新推荐（换一批）
 * 传入当前批次索引，返回下一批菜谱
 */
router.post('/refresh', aiLimiter, async (req, res, next) => {
  try {
    const { userId, sessionId, currentBatchIndex = 0 } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const result = await refreshRecommendations(userId, sessionId, currentBatchIndex);

    logger.info(`用户 ${userId} 换一批推荐，批次 ${result.batchIndex}/${result.totalBatches}，循环: ${result.isLooping}`);

    res.json({
      success: true,
      data: {
        recipes: result.recipes,
        batchIndex: result.batchIndex,
        totalBatches: result.totalBatches,
        totalRecipes: result.totalRecipes,
        hasMore: result.hasMore,
        fromCache: result.fromCache,
        isLooping: result.isLooping
      },
      message: result.isLooping ? `已循环推荐 ${result.recipes.length} 道菜谱` : `已推荐 ${result.recipes.length} 道新菜谱`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recommend/image-status/:imageId
 * 检查图片生成状态
 */
router.get('/image-status/:imageId', async (req, res, next) => {
  try {
    const { imageId } = req.params;

    const status = await checkImageStatus(parseInt(imageId));

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/recommend/image-status/batch
 * 批量检查图片生成状态
 */
router.post('/image-status/batch', async (req, res, next) => {
  try {
    const { imageIds } = req.body;

    if (!imageIds || !Array.isArray(imageIds)) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: imageIds'
      });
    }

    const statusMap = await batchCheckImageStatus(imageIds);

    // 转换Map为对象
    const result = {};
    statusMap.forEach((value, key) => {
      result[key] = value;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
