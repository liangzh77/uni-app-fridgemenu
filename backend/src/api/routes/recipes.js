/**
 * 菜谱相关API路由
 * 处理菜谱查询、详情、推荐等
 */
const express = require('express');
const router = express.Router();
const { Recipe, ImageLibrary, Favorite } = require('../../models');
const logger = require('../../config/logger');

/**
 * GET /api/recipes
 * 获取菜谱列表（分页）
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      cuisineType,
      difficulty
    } = req.query;

    const result = await Recipe.paginate({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      cuisineType,
      difficulty
    });

    res.json({
      success: true,
      data: result.rows,
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
 * GET /api/recipes/:id
 * 获取菜谱详情
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const recipe = await Recipe.findByPk(id, {
      include: [{
        model: ImageLibrary,
        as: 'image',
        attributes: ['imageUrl', 'imageSizeKb']
      }]
    });

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: '菜谱不存在'
      });
    }

    // 检查是否已收藏
    let isFavorited = false;
    if (userId) {
      isFavorited = await Favorite.isFavorited(userId, id);
    }

    res.json({
      success: true,
      data: {
        ...recipe.toJSON(),
        isFavorited
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recipes/search/:name
 * 按菜名搜索菜谱
 */
router.get('/search/:name', async (req, res, next) => {
  try {
    const { name } = req.params;

    const recipe = await Recipe.findByDishName(name);

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: '未找到匹配的菜谱'
      });
    }

    res.json({
      success: true,
      data: recipe
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/recipes
 * 创建菜谱（通常由AI服务调用）
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      dishName,
      normalizedDishName,
      ingredients,
      steps,
      cookingTime,
      difficulty,
      cuisineType,
      tips
    } = req.body;

    if (!dishName || !ingredients || !steps) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: dishName, ingredients, steps'
      });
    }

    const recipe = await Recipe.create({
      dishName,
      normalizedDishName: normalizedDishName || dishName,
      ingredientsJson: ingredients,
      stepsJson: steps,
      cookingTime,
      difficulty: difficulty || 'medium',
      cuisineType,
      tips
    });

    logger.info(`创建菜谱: ${dishName}`);

    res.status(201).json({
      success: true,
      data: recipe
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/recipes/:id/image
 * 关联菜谱图片
 */
router.put('/:id/image', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { imageLibraryId } = req.body;

    if (!imageLibraryId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: imageLibraryId'
      });
    }

    const [updated] = await Recipe.linkImage(id, imageLibraryId);

    if (updated === 0) {
      return res.status(404).json({
        success: false,
        message: '菜谱不存在'
      });
    }

    res.json({
      success: true,
      message: '图片关联成功'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
