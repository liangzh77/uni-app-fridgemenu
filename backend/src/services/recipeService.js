/**
 * 菜谱服务
 * 整合AI推荐和图片生成
 */
const logger = require('../config/logger');
const { Recipe, ImageLibrary, Ingredient } = require('../models');
const { recommendRecipes, normalizeDishName, generateRecipeHash } = require('./aiService');
const { getOrGenerateImage } = require('./imageService');

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

  // 1. 获取用户食材
  const ingredientNames = await Ingredient.getIngredientNames(userId, sessionId);

  if (ingredientNames.length === 0) {
    throw new Error('请先添加食材');
  }

  logger.info(`用户 ${userId} 请求推荐，食材: ${ingredientNames.join('、')}`);

  // 2. 获取要排除的菜名
  let excludeDishes = [];
  if (excludeIds.length > 0) {
    const excludeRecipes = await Recipe.findAll({
      where: { id: excludeIds },
      attributes: ['dishName']
    });
    excludeDishes = excludeRecipes.map(r => r.dishName);
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

    // 保存或更新菜谱
    let recipe = await Recipe.findByDishName(normalizedName);

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
    const imageInfo = await getOrGenerateImage(normalizedName, recipeHash);

    // 关联图片
    if (imageInfo.imageId && !recipe.imageLibraryId) {
      await Recipe.linkImage(recipe.id, imageInfo.imageId);
    }

    results.push({
      id: recipe.id,
      dishName: recipe.dishName,
      normalizedDishName: recipe.normalizedDishName,
      ingredients: recipe.ingredientsJson,
      steps: recipe.stepsJson,
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
  const recipe = await Recipe.findByPk(recipeId, {
    include: [{
      model: ImageLibrary,
      as: 'image',
      attributes: ['imageUrl', 'imageSizeKb', 'ossDownloaded']
    }]
  });

  if (!recipe) {
    throw new Error('菜谱不存在');
  }

  // 检查图片状态
  let imageUrl = '';
  let imagePending = false;

  if (recipe.image) {
    imageUrl = recipe.image.imageUrl;
    imagePending = !recipe.image.ossDownloaded;
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
