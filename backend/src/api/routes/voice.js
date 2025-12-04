/**
 * 语音相关API路由
 * 处理语音文本解析
 */
const express = require('express');
const router = express.Router();
const { parseVoiceText, suggestIngredients } = require('../../services/voiceService');
const { Ingredient, FoodSynonymMapping } = require('../../models');
const logger = require('../../config/logger');

/**
 * POST /api/voice/parse
 * 解析语音文本，提取食材
 */
router.post('/parse', async (req, res, next) => {
  try {
    const { text, userId, sessionId, autoAdd } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: '语音文本不能为空'
      });
    }

    // 解析食材
    const ingredients = await parseVoiceText(text);

    logger.info(`用户 ${userId} 语音解析: "${text}" -> ${ingredients.length} 个食材`);

    // 如果设置了自动添加
    if (autoAdd && userId && sessionId && ingredients.length > 0) {
      const result = await Ingredient.bulkCreateWithDedup(
        userId,
        sessionId,
        ingredients
      );

      return res.json({
        success: true,
        data: {
          ingredients,
          created: result.created,
          skipped: result.skipped,
          autoAdded: true
        },
        message: `识别到 ${ingredients.length} 个食材，已添加 ${result.created.length} 个`
      });
    }

    res.json({
      success: true,
      data: {
        ingredients,
        originalText: text
      },
      message: `识别到 ${ingredients.length} 个食材`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice/normalize
 * 规范化食材名称
 */
router.post('/normalize', async (req, res, next) => {
  try {
    const { ingredients } = req.body;

    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({
        success: false,
        message: '食材列表格式错误'
      });
    }

    const normalized = await FoodSynonymMapping.normalizeAll(ingredients);

    res.json({
      success: true,
      data: normalized
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice/suggest
 * 根据已有食材推荐补充食材
 */
router.get('/suggest', async (req, res, next) => {
  try {
    const { ingredients } = req.query;

    if (!ingredients) {
      return res.status(400).json({
        success: false,
        message: '缺少食材列表'
      });
    }

    const ingredientList = ingredients.split(',').map(i => i.trim());
    const suggestions = await suggestIngredients(ingredientList);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice/synonyms/:name
 * 获取食材的同义词
 */
router.get('/synonyms/:name', async (req, res, next) => {
  try {
    const { name } = req.params;

    // 先规范化名称
    const normalized = await FoodSynonymMapping.normalize(name);

    // 获取同义词列表
    const synonyms = await FoodSynonymMapping.getSynonyms(normalized.standardName);

    res.json({
      success: true,
      data: {
        standardName: normalized.standardName,
        category: normalized.category,
        synonyms
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
