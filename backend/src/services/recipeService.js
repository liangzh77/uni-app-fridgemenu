/**
 * 菜谱服务
 * 整合AI推荐和图片生成
 * 支持缓存和分批返回
 */
const logger = require('../config/logger');
const { Recipe, ImageLibrary, Ingredient, RecommendationCache } = require('../models');
const { recommendRecipes, normalizeDishName, generateRecipeHash } = require('./aiService');
const { getOrGenerateImage } = require('./imageService');
const { ingredientStore, recipeStore, getStoreKey, getNextMockId, getRecipeById } = require('../utils/memoryStore');

// Mock 模式检测
const isMockMode = process.env.MOCK_MODE === 'true';

// 每批返回的菜谱数量
const BATCH_SIZE = 3;
// 总共请求的菜谱数量
const TOTAL_RECIPES = 3;
// 最少需要的菜谱数量（少于此数量时调用AI扩充）
const MIN_RECIPES = 3;

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
 * 首次调用时从缓存或AI获取10个菜谱，返回前3个
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {Object} options - 选项
 * @returns {Promise<{recipes: Array, batchIndex: number, totalBatches: number, hasMore: boolean}>}
 */
async function getRecommendations(userId, sessionId, options = {}) {
  const {
    batchIndex = 0,  // 当前批次索引，0表示第一批
    preferences = {}
  } = options;

  // 1. 获取用户食材（带降级）
  const ingredientNames = await getIngredientNamesWithFallback(userId, sessionId);

  if (ingredientNames.length === 0) {
    throw new Error('请先添加食材');
  }

  logger.info(`用户 ${userId} 请求推荐，食材: ${ingredientNames.join('、')}，批次: ${batchIndex}`);

  // 2. 尝试从缓存获取
  let allRecipes = null;
  let fromCache = false;

  if (!isMockMode) {
    try {
      const cache = await RecommendationCache.findByIngredients(ingredientNames);
      if (cache) {
        allRecipes = cache.recipesJson;
        fromCache = true;
        logger.info(`从缓存获取推荐，共 ${allRecipes.length} 个菜谱`);
      }
    } catch (err) {
      logger.warn('查询缓存失败，将调用AI:', err.message);
    }
  }

  // 3. 如果没有缓存，调用AI获取推荐
  if (!allRecipes) {
    logger.info('调用AI获取推荐...');
    const aiRecipes = await recommendRecipes(ingredientNames, {
      count: TOTAL_RECIPES,
      preferences
    });

    // 保存到缓存
    if (!isMockMode) {
      try {
        await RecommendationCache.upsertCache(ingredientNames, aiRecipes, 7);
        logger.info(`已缓存 ${aiRecipes.length} 个菜谱`);
      } catch (err) {
        logger.warn('保存缓存失败:', err.message);
      }
    }

    allRecipes = aiRecipes;
  }

  // 3.1 如果缓存中的菜谱少于 MIN_RECIPES，调用AI扩充
  if (allRecipes.length < MIN_RECIPES) {
    logger.info(`缓存菜谱不足（${allRecipes.length}个），调用AI扩充...`);
    const existingDishNames = allRecipes.map(r => r.dishName || r.normalizedDishName);
    const additionalRecipes = await recommendRecipes(ingredientNames, {
      count: TOTAL_RECIPES,
      preferences,
      excludeDishes: existingDishNames
    });

    // 合并并去重
    const mergedRecipes = [...allRecipes];
    for (const recipe of additionalRecipes) {
      const name = recipe.normalizedDishName || normalizeDishName(recipe.dishName);
      if (!mergedRecipes.some(r => (r.normalizedDishName || normalizeDishName(r.dishName)) === name)) {
        mergedRecipes.push(recipe);
      }
    }

    allRecipes = mergedRecipes;
    fromCache = false;

    // 更新缓存
    if (!isMockMode) {
      try {
        await RecommendationCache.upsertCache(ingredientNames, allRecipes, 7);
        logger.info(`已扩充并缓存 ${allRecipes.length} 个菜谱`);
      } catch (err) {
        logger.warn('更新缓存失败:', err.message);
      }
    }
  }

  // 4. 计算分批（支持循环）
  const totalRecipes = allRecipes.length;
  const totalBatches = Math.ceil(totalRecipes / BATCH_SIZE);

  // 使用取模实现循环，batchIndex 可以无限增长
  const effectiveBatchIndex = batchIndex % totalBatches;
  const startIndex = effectiveBatchIndex * BATCH_SIZE;
  const endIndex = Math.min(startIndex + BATCH_SIZE, totalRecipes);
  const batchRecipes = allRecipes.slice(startIndex, endIndex);

  // 如果当前批次是最后一批且不满3个，从头部补充
  let finalBatchRecipes = batchRecipes;
  if (batchRecipes.length < BATCH_SIZE && totalRecipes >= BATCH_SIZE) {
    const remaining = BATCH_SIZE - batchRecipes.length;
    const wrapAroundRecipes = allRecipes.slice(0, remaining);
    finalBatchRecipes = [...batchRecipes, ...wrapAroundRecipes];
    logger.info(`最后一批不足${BATCH_SIZE}个，从头部补充${remaining}个`);
  }

  if (finalBatchRecipes.length === 0) {
    return {
      recipes: [],
      batchIndex: effectiveBatchIndex,
      totalBatches,
      hasMore: true, // 循环模式永远有更多
      fromCache,
      isLooping: true
    };
  }

  // 5. 处理每个菜谱（保存到数据库、触发图片生成）
  const results = [];

  for (const aiRecipe of finalBatchRecipes) {
    const normalizedName = aiRecipe.normalizedDishName || normalizeDishName(aiRecipe.dishName);
    let recipe;
    let imageInfo = { imageUrl: '', imageId: null, isPending: false };

    if (isMockMode) {
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
          tips: aiRecipe.tips,
          score: aiRecipe.score || 5
        };
        recipeStore.set(normalizedName, recipe);
        logger.info(`[Mock模式] 创建菜谱: ${aiRecipe.dishName}`);
      }
    } else {
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

        // 触发图片生成
        const recipeHash = aiRecipe.recipeHash || generateRecipeHash(normalizedName, ingredientNames);
        imageInfo = await getOrGenerateImage(normalizedName, recipeHash);

        if (imageInfo.imageId && !recipe.imageLibraryId) {
          await Recipe.linkImage(recipe.id, imageInfo.imageId);
        }
      } catch (dbError) {
        logger.error('数据库操作失败:', dbError);
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
            tips: aiRecipe.tips,
            score: aiRecipe.score || 5
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
      score: aiRecipe.score || 5,
      imageUrl: imageInfo.imageUrl,
      imageId: imageInfo.imageId,
      imagePending: imageInfo.isPending
    });
  }

  // 判断是否开始循环（已经显示过所有菜谱至少一轮）
  const isLooping = batchIndex >= totalBatches;

  return {
    recipes: results,
    batchIndex: effectiveBatchIndex,
    totalBatches,
    totalRecipes,
    hasMore: true, // 循环模式永远有更多
    fromCache,
    isLooping
  };
}

/**
 * 刷新推荐（换一批）
 * 返回下一批菜谱
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {number} currentBatchIndex - 当前批次索引
 * @returns {Promise<{recipes: Array, batchIndex: number, totalBatches: number, hasMore: boolean}>}
 */
async function refreshRecommendations(userId, sessionId, currentBatchIndex = 0) {
  return getRecommendations(userId, sessionId, {
    batchIndex: currentBatchIndex + 1
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
