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
 * 获取菜谱推荐
 */
router.post('/', aiLimiter, async (req, res, next) => {
  try {
    const { userId, sessionId, count = 3, preferences } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const recipes = await getRecommendations(userId, sessionId, {
      count: Math.min(count, 10), // 最多10个
      preferences
    });

    logger.info(`用户 ${userId} 获取了 ${recipes.length} 个推荐`);

    res.json({
      success: true,
      data: recipes,
      message: `已推荐 ${recipes.length} 道菜谱`
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
 */
router.post('/refresh', aiLimiter, async (req, res, next) => {
  try {
    const { userId, sessionId, excludeIds = [], count = 3 } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const recipes = await refreshRecommendations(
      userId,
      sessionId,
      excludeIds,
      Math.min(count, 10)
    );

    logger.info(`用户 ${userId} 刷新推荐，排除 ${excludeIds.length} 个`);

    res.json({
      success: true,
      data: recipes,
      message: `已推荐 ${recipes.length} 道新菜谱`
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
