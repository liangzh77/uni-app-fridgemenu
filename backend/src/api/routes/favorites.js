/**
 * 收藏相关API路由
 * 处理用户收藏操作
 */
const express = require('express');
const router = express.Router();
const { Favorite, Recipe, ImageLibrary } = require('../../models');
const logger = require('../../config/logger');

/**
 * GET /api/favorites
 * 获取用户收藏列表（分页）
 */
router.get('/', async (req, res, next) => {
  try {
    const { userId, page = 1, pageSize = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId'
      });
    }

    // 获取收藏记录
    const result = await Favorite.getUserFavorites(userId, {
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });

    // 获取关联的菜谱详情
    const recipeIds = result.rows.map(f => f.recipeId);
    const recipes = await Recipe.findAll({
      where: { id: recipeIds },
      include: [{
        model: ImageLibrary,
        as: 'image',
        attributes: ['imageUrl']
      }]
    });

    // 构建响应数据
    const recipeMap = new Map(recipes.map(r => [r.id, r]));
    const favorites = result.rows.map(f => ({
      id: f.id,
      recipeId: f.recipeId,
      favoritedAt: f.favoritedAt,
      recipe: recipeMap.get(f.recipeId) || null
    }));

    res.json({
      success: true,
      data: favorites,
      pagination: {
        total: result.count,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(result.count / parseInt(pageSize))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/favorites
 * 添加收藏
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId, recipeId } = req.body;

    if (!userId || !recipeId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, recipeId'
      });
    }

    // 检查菜谱是否存在
    const recipe = await Recipe.findByPk(recipeId);
    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: '菜谱不存在'
      });
    }

    const { favorite, created } = await Favorite.addFavorite(userId, recipeId);

    logger.info(`用户 ${userId} ${created ? '收藏' : '已收藏'} 菜谱 ${recipeId}`);

    res.status(created ? 201 : 200).json({
      success: true,
      data: favorite,
      message: created ? '收藏成功' : '已经收藏过了'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/favorites/:recipeId
 * 取消收藏
 */
router.delete('/:recipeId', async (req, res, next) => {
  try {
    const { recipeId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId'
      });
    }

    const removed = await Favorite.removeFavorite(userId, parseInt(recipeId));

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: '未找到该收藏记录'
      });
    }

    logger.info(`用户 ${userId} 取消收藏菜谱 ${recipeId}`);

    res.json({
      success: true,
      message: '取消收藏成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/favorites/toggle
 * 切换收藏状态
 */
router.post('/toggle', async (req, res, next) => {
  try {
    const { userId, recipeId } = req.body;

    if (!userId || !recipeId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, recipeId'
      });
    }

    // 检查菜谱是否存在
    const recipe = await Recipe.findByPk(recipeId);
    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: '菜谱不存在'
      });
    }

    const result = await Favorite.toggleFavorite(userId, recipeId);

    logger.info(`用户 ${userId} ${result.isFavorited ? '收藏' : '取消收藏'} 菜谱 ${recipeId}`);

    res.json({
      success: true,
      data: {
        isFavorited: result.isFavorited,
        favorite: result.favorite || null
      },
      message: result.isFavorited ? '收藏成功' : '取消收藏成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/favorites/check
 * 检查是否已收藏（批量）
 */
router.get('/check', async (req, res, next) => {
  try {
    const { userId, recipeIds } = req.query;

    if (!userId || !recipeIds) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, recipeIds'
      });
    }

    const ids = recipeIds.split(',').map(id => parseInt(id.trim()));
    const favoriteMap = await Favorite.checkFavorites(userId, ids);

    // 转换Map为对象
    const result = {};
    favoriteMap.forEach((value, key) => {
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

/**
 * GET /api/favorites/count
 * 获取用户收藏数量
 */
router.get('/count', async (req, res, next) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId'
      });
    }

    const count = await Favorite.countUserFavorites(userId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
