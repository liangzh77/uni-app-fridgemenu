/**
 * 食材相关API路由
 * 处理食材的增删改查
 */
const express = require('express');
const router = express.Router();
const { Ingredient, FoodSynonymMapping } = require('../../models');
const logger = require('../../config/logger');

/**
 * GET /api/ingredients
 * 获取用户当前会话的食材列表
 */
router.get('/', async (req, res, next) => {
  try {
    const { userId, sessionId } = req.query;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const ingredients = await Ingredient.findByUserId(userId, sessionId);

    res.json({
      success: true,
      data: ingredients,
      count: ingredients.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ingredients
 * 添加食材（支持批量，自动去重和规范化）
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId, sessionId, ingredients } = req.body;

    if (!userId || !sessionId || !ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数或格式错误'
      });
    }

    // 规范化食材名称
    const normalizedIngredients = [];
    for (const item of ingredients) {
      const name = typeof item === 'string' ? item : item.name;
      const normalized = await FoodSynonymMapping.normalize(name);

      normalizedIngredients.push({
        name: normalized.standardName,
        originalName: name,
        category: normalized.category || (typeof item === 'object' ? item.category : null),
        quantity: typeof item === 'object' ? item.quantity : null,
        unit: typeof item === 'object' ? item.unit : null
      });
    }

    // 批量创建（自动去重）
    const result = await Ingredient.bulkCreateWithDedup(
      userId,
      sessionId,
      normalizedIngredients
    );

    logger.info(`用户 ${userId} 添加了 ${result.created.length} 个食材, 跳过 ${result.skipped.length} 个重复`);

    res.json({
      success: true,
      data: {
        created: result.created,
        skipped: result.skipped
      },
      message: `成功添加 ${result.created.length} 个食材`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/ingredients/:id
 * 删除单个食材
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId'
      });
    }

    const deleted = await Ingredient.deleteByUserAndIds(userId, parseInt(id));

    if (deleted === 0) {
      return res.status(404).json({
        success: false,
        message: '食材不存在或无权删除'
      });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/ingredients
 * 清空当前会话所有食材
 */
router.delete('/', async (req, res, next) => {
  try {
    const { userId, sessionId } = req.query;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const deleted = await Ingredient.clearSession(userId, sessionId);

    res.json({
      success: true,
      message: `已清空 ${deleted} 个食材`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ingredients/names
 * 获取食材名称列表（用于AI推荐）
 */
router.get('/names', async (req, res, next) => {
  try {
    const { userId, sessionId } = req.query;

    if (!userId || !sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId, sessionId'
      });
    }

    const names = await Ingredient.getIngredientNames(userId, sessionId);

    res.json({
      success: true,
      data: names
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
