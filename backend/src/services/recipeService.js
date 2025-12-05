/**
 * 菜谱服务
 * 整合AI推荐和图片生成
 */
const logger = require('../config/logger');
const { Recipe, ImageLibrary, Ingredient } = require('../models');
const { recommendRecipes, normalizeDishName, generateRecipeHash } = require('./aiService');
const { getOrGenerateImage } = require('./imageService');
const { ingredientStore, recipeStore, getStoreKey, getNextMockId, getRecipeById } = require('../utils/memoryStore');

// Mock 模式检测
const isMockMode = process.env.MOCK_MODE === 'true';

/**
 * 获取用户食材名称（带降级逻辑）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @returns {Promise<string[]>} 食材名称数组
 */
async function getIngredientNamesWithFallback(userId, sessionId) {
  try {
    return await Ingredient.getIngredientNames(userId, sessionId);
  } catch (dbError) {
    // 数据库不可用，使用内存存储
    logger.warn('recipeService: 数据库不可用，使用内存存储模式获取食材');
    const key = getStoreKey(userId, sessionId);
    const existing = ingredientStore.get(key) || [];
    return existing.map(i => i.name);
  }
}

/**
 * 获取用户食材并推荐菜谱
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {Object} options - 选项
 * @returns {Promise<Array>} 推荐的菜谱列表
 */
async function getRecommendations(userId, sessionId, options = {}) {
  const {
    count = 3,
    preferences = {},
    excludeIds = []
  } = options;

  // 1. 获取用户食材（带降级）
  const ingredientNames = await getIngredientNamesWithFallback(userId, sessionId);

  if (ingredientNames.length === 0) {
    throw new Error('请先添加食材');
  }

  logger.info(`用户 ${userId} 请求推荐，食材: ${ingredientNames.join('、')}`);

  // 2. 获取要排除的菜名
  let excludeDishes = [];
  if (excludeIds.length > 0 && !isMockMode) {
    try {
      const excludeRecipes = await Recipe.findAll({
        where: { id: excludeIds },
        attributes: ['dishName']
      });
      excludeDishes = excludeRecipes.map(r => r.dishName);
    } catch (err) {
      logger.warn('获取排除菜谱失败，跳过');
    }
  }

  // 3. 调用AI获取推荐
  const aiRecipes = await recommendRecipes(ingredientNames, {
    count,
    preferences,
    excludeDishes
  });

  // 4. 保存菜谱并触发图片生成
  const results = [];

  for (const aiRecipe of aiRecipes) {
    // 规范化菜名
    const normalizedName = aiRecipe.normalizedDishName || normalizeDishName(aiRecipe.dishName);

    let recipe;
    let imageInfo = { imageUrl: '', imageId: null, isPending: false };

    if (isMockMode) {
      // Mock 模式：使用内存存储
      recipe = recipeStore.get(normalizedName);
      if (!recipe) {
        recipe = {
          id: getNextMockId(),
          dishName: aiRecipe.dishName,
          normalizedDishName: normalizedName,
          ingredientsJson: aiRecipe.ingredients,
          stepsJson: aiRecipe.steps,
          cookingTime: aiRecipe.cookingTime,
          difficulty: aiRecipe.difficulty || 'medium',
          cuisineType: aiRecipe.cuisineType,
          tips: aiRecipe.tips
        };
        recipeStore.set(normalizedName, recipe);
        logger.info(`[Mock模式] 创建菜谱: ${aiRecipe.dishName}`);
      }
    } else {
      // 正常模式：使用数据库
      try {
        recipe = await Recipe.findByDishName(normalizedName);

        if (!recipe) {
          recipe = await Recipe.create({
            dishName: aiRecipe.dishName,
            normalizedDishName: normalizedName,
            ingredientsJson: aiRecipe.ingredients,
            stepsJson: aiRecipe.steps,
            cookingTime: aiRecipe.cookingTime,
            difficulty: aiRecipe.difficulty || 'medium',
            cuisineType: aiRecipe.cuisineType,
            tips: aiRecipe.tips
          });

          logger.info(`创建新菜谱: ${aiRecipe.dishName}`);
        }

        // 触发图片生成（异步，不等待）
        const recipeHash = aiRecipe.recipeHash || generateRecipeHash(normalizedName, ingredientNames);
        imageInfo = await getOrGenerateImage(normalizedName, recipeHash);

        // 关联图片
        if (imageInfo.imageId && !recipe.imageLibraryId) {
          await Recipe.linkImage(recipe.id, imageInfo.imageId);
        }
      } catch (dbError) {
        logger.error('数据库操作失败:', dbError);
        // 降级为 Mock 数据，先检查内存中是否已存在
        recipe = recipeStore.get(normalizedName);
        if (!recipe) {
          recipe = {
            id: getNextMockId(),
            dishName: aiRecipe.dishName,
            normalizedDishName: normalizedName,
            ingredientsJson: aiRecipe.ingredients,
            stepsJson: aiRecipe.steps,
            cookingTime: aiRecipe.cookingTime,
            difficulty: aiRecipe.difficulty || 'medium',
            cuisineType: aiRecipe.cuisineType,
            tips: aiRecipe.tips
          };
          recipeStore.set(normalizedName, recipe);
          logger.info(`[降级模式] 内存创建菜谱: ${aiRecipe.dishName}`);
        }
      }
    }

    results.push({
      id: recipe.id,
      dishName: recipe.dishName,
      normalizedDishName: recipe.normalizedDishName,
      ingredients: recipe.ingredientsJson || aiRecipe.ingredients,
      steps: recipe.stepsJson || aiRecipe.steps,
      cookingTime: recipe.cookingTime,
      difficulty: recipe.difficulty,
      cuisineType: recipe.cuisineType,
      tips: recipe.tips,
      imageUrl: imageInfo.imageUrl,
      imageId: imageInfo.imageId,
      imagePending: imageInfo.isPending
    });
  }

  return results;
}

/**
 * 刷新推荐（换一批）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {number[]} excludeIds - 要排除的菜谱ID
 * @param {number} count - 推荐数量
 * @returns {Promise<Array>} 新的推荐菜谱列表
 */
async function refreshRecommendations(userId, sessionId, excludeIds = [], count = 3) {
  return getRecommendations(userId, sessionId, {
    count,
    excludeIds
  });
}

/**
 * 获取菜谱详情
 * @param {number} recipeId - 菜谱ID
 * @param {string} userId - 用户ID（可选，用于检查收藏状态）
 * @returns {Promise<Object>} 菜谱详情
 */
async function getRecipeDetail(recipeId, userId = null) {
  let recipe;
  let imageUrl = '';
  let imagePending = false;

  try {
    recipe = await Recipe.findByPk(recipeId, {
      include: [{
        model: ImageLibrary,
        as: 'image',
        attributes: ['imageUrl', 'imageSizeKb', 'ossDownloaded']
      }]
    });

    if (recipe && recipe.image) {
      imageUrl = recipe.image.imageUrl;
      imagePending = !recipe.image.ossDownloaded;
    }
  } catch (dbError) {
    logger.warn('getRecipeDetail: 数据库不可用，使用内存存储模式');
    // 从内存中查找菜谱
    recipe = getRecipeById(recipeId);
  }

  if (!recipe) {
    throw new Error('菜谱不存在');
  }

  return {
    id: recipe.id,
    dishName: recipe.dishName,
    normalizedDishName: recipe.normalizedDishName,
    ingredients: recipe.ingredientsJson,
    steps: recipe.stepsJson,
    cookingTime: recipe.cookingTime,
    difficulty: recipe.difficulty,
    cuisineType: recipe.cuisineType,
    tips: recipe.tips,
    imageUrl,
    imagePending,
    createdAt: recipe.created_at
  };
}

/**
 * 检查图片生成状态
 * @param {number} imageId - 图片库ID
 * @returns {Promise<{ready: boolean, imageUrl: string}>}
 */
async function checkImageStatus(imageId) {
  const image = await ImageLibrary.findByPk(imageId);

  if (!image) {
    return { ready: false, imageUrl: '' };
  }

  return {
    ready: image.ossDownloaded,
    imageUrl: image.imageUrl
  };
}

/**
 * 批量检查图片状态
 * @param {number[]} imageIds - 图片库ID数组
 * @returns {Promise<Map<number, {ready: boolean, imageUrl: string}>>}
 */
async function batchCheckImageStatus(imageIds) {
  const images = await ImageLibrary.findAll({
    where: { id: imageIds },
    attributes: ['id', 'imageUrl', 'ossDownloaded']
  });

  const result = new Map();

  for (const id of imageIds) {
    const image = images.find(i => i.id === id);
    if (image) {
      result.set(id, {
        ready: image.ossDownloaded,
        imageUrl: image.imageUrl
      });
    } else {
      result.set(id, { ready: false, imageUrl: '' });
    }
  }

  return result;
}

module.exports = {
  getRecommendations,
  refreshRecommendations,
  getRecipeDetail,
  checkImageStatus,
  batchCheckImageStatus
};
