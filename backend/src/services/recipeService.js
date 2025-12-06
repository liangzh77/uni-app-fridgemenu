/**
 * 菜谱服务
 * 整合AI推荐和图片生成
 * 支持缓存和分批返回
 */
const logger = require('../config/logger');
const { Recipe, ImageLibrary, Ingredient, RecommendationCache } = require('../models');
const { recommendRecipes, getRecipeNames, getRecipeDetail: getAIRecipeDetail, normalizeDishName, generateRecipeHash } = require('./aiService');
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
            mainIngredientsJson: aiRecipe.mainIngredients || null,
            seasoningsJson: aiRecipe.seasonings || null,
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
      mainIngredients: recipe.mainIngredientsJson || aiRecipe.mainIngredients || null,
      seasonings: recipe.seasoningsJson || aiRecipe.seasonings || null,
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
    mainIngredients: recipe.mainIngredientsJson || null,
    seasonings: recipe.seasoningsJson || null,
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

/**
 * 获取菜名列表（第一步，快速返回）
 * 新逻辑：优先从数据库查找匹配食材的已有菜谱，不足再用AI补充
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @returns {Promise<{names: Array, fromCache: boolean, existingRecipes: Array}>}
 */
async function getRecipeNamesForUser(userId, sessionId) {
  // 1. 获取用户食材
  const ingredientNames = await getIngredientNamesWithFallback(userId, sessionId);

  if (ingredientNames.length === 0) {
    throw new Error('请先添加食材');
  }

  logger.info(`[Names] 用户 ${userId} 请求菜名列表，食材: ${ingredientNames.join('、')}`);

  const allNames = [];
  const existingRecipes = []; // 存储已有菜谱的完整信息

  // 2. 优先从数据库查找匹配食材的已有菜谱
  if (!isMockMode) {
    try {
      const dbRecipes = await Recipe.findByIngredients(ingredientNames, TOTAL_RECIPES);
      if (dbRecipes.length > 0) {
        logger.info(`[Names] 从数据库找到 ${dbRecipes.length} 个匹配的已有菜谱`);

        for (const recipe of dbRecipes) {
          allNames.push({
            dishName: recipe.dishName,
            score: 5,
            fromDb: true // 标记来自数据库
          });

          // 查询图片信息
          let imageUrl = '';
          let imageId = recipe.imageLibraryId || null;
          let imagePending = false;

          if (recipe.imageLibraryId) {
            try {
              const imageRecord = await ImageLibrary.findByPk(recipe.imageLibraryId);
              if (imageRecord) {
                if (imageRecord.ossDownloaded && imageRecord.imageUrl) {
                  imageUrl = imageRecord.imageUrl;
                  imagePending = false;
                } else {
                  // 图片还在生成中
                  imagePending = true;
                }
              }
            } catch (imgErr) {
              logger.warn(`[Names] 查询图片失败 (id=${recipe.imageLibraryId}):`, imgErr.message);
            }
          }

          // 保存完整菜谱信息，后续直接使用
          existingRecipes.push({
            id: recipe.id,
            dishName: recipe.dishName,
            normalizedDishName: recipe.normalizedDishName,
            ingredients: recipe.ingredientsJson,
            steps: recipe.stepsJson,
            cookingTime: recipe.cookingTime,
            difficulty: recipe.difficulty,
            cuisineType: recipe.cuisineType,
            tips: recipe.tips,
            imageLibraryId: imageId,
            imageUrl: imageUrl,
            imagePending: imagePending
          });
        }
      }
    } catch (err) {
      logger.warn('[Names] 查询数据库失败:', err.message);
    }
  }

  // 3. 计算还需要生成多少个
  const needCount = TOTAL_RECIPES - allNames.length;

  if (needCount > 0) {
    // 获取已有菜名，用于排除重复
    const existingDishNames = allNames.map(n => n.dishName);

    logger.info(`[Names] 还需要生成 ${needCount} 个菜谱，排除: ${existingDishNames.join('、')}`);

    // 调用 AI 获取剩余菜名
    const aiNames = await getRecipeNames(ingredientNames, {
      count: needCount,
      excludeDishes: existingDishNames
    });

    if (aiNames.length > 0) {
      logger.info(`[Names] AI 返回 ${aiNames.length} 个菜名: ${aiNames.map(n => n.dishName).join('、')}`);
      allNames.push(...aiNames.map(n => ({ ...n, fromDb: false })));
    }
  }

  if (allNames.length === 0) {
    throw new Error('未能获取推荐');
  }

  logger.info(`[Names] 最终返回 ${allNames.length} 个菜名: ${allNames.map(n => n.dishName).join('、')}`);
  return { names: allNames, fromCache: false, ingredientNames, existingRecipes };
}

/**
 * 获取单个菜谱详情（第二步，逐个调用）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {string} dishName - 菜名
 * @param {number} score - 推荐分
 * @returns {Promise<Object>}
 */
async function getSingleRecipeDetail(userId, sessionId, dishName, score = 5) {
  // 1. 获取用户食材
  const ingredientNames = await getIngredientNamesWithFallback(userId, sessionId);

  if (ingredientNames.length === 0) {
    throw new Error('请先添加食材');
  }

  logger.info(`[Detail] 获取菜谱详情: ${dishName}`);

  // 2. 先检查缓存中是否已有完整详情
  if (!isMockMode) {
    try {
      const cache = await RecommendationCache.findByIngredients(ingredientNames);
      if (cache && cache.recipesJson) {
        const cached = cache.recipesJson.find(r => r.dishName === dishName);
        if (cached && cached.ingredients && cached.ingredients.length > 0) {
          logger.info(`[Detail] 从缓存获取 ${dishName} 详情`);
          return await processRecipeForResponse(cached, ingredientNames);
        }
      }
    } catch (err) {
      logger.warn('[Detail] 查询缓存失败:', err.message);
    }
  }

  // 3. 调用 AI 获取详情
  try {
    const detail = await getAIRecipeDetail(dishName, ingredientNames);
    const recipe = {
      ...detail,
      normalizedDishName: normalizeDishName(detail.dishName || dishName),
      score,
      recipeHash: generateRecipeHash(normalizeDishName(detail.dishName || dishName), ingredientNames)
    };

    const processedRecipe = await processRecipeForResponse(recipe, ingredientNames);

    // 4. 更新缓存
    if (!isMockMode) {
      try {
        const cache = await RecommendationCache.findByIngredients(ingredientNames);
        if (cache && cache.recipesJson) {
          const recipes = cache.recipesJson;
          const index = recipes.findIndex(r => r.dishName === dishName);
          if (index >= 0) {
            recipes[index] = processedRecipe;
          } else {
            recipes.push(processedRecipe);
          }
          await RecommendationCache.upsertCache(ingredientNames, recipes, 7);
          logger.info(`[Detail] 已更新缓存: ${dishName}`);
        }
      } catch (err) {
        logger.warn('[Detail] 更新缓存失败:', err.message);
      }
    }

    return processedRecipe;
  } catch (err) {
    logger.error(`[Detail] 获取 ${dishName} 详情失败:`, err.message);
    // 返回基础信息
    return {
      id: getNextMockId(),
      dishName,
      normalizedDishName: normalizeDishName(dishName),
      ingredients: [],
      steps: ['暂无详细步骤'],
      cookingTime: 20,
      difficulty: 'medium',
      cuisineType: '家常菜',
      tips: '',
      score,
      imageUrl: '',
      imageId: null,
      imagePending: false
    };
  }
}

/**
 * 处理菜谱数据用于响应
 */
async function processRecipeForResponse(aiRecipe, ingredientNames) {
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
    }
  } else {
    try {
      recipe = await Recipe.findByDishName(normalizedName);

      if (!recipe) {
        recipe = await Recipe.create({
          dishName: aiRecipe.dishName,
          normalizedDishName: normalizedName,
          ingredientsJson: aiRecipe.ingredients,
          mainIngredientsJson: aiRecipe.mainIngredients || null,
          seasoningsJson: aiRecipe.seasonings || null,
          stepsJson: aiRecipe.steps,
          cookingTime: aiRecipe.cookingTime,
          difficulty: aiRecipe.difficulty || 'medium',
          cuisineType: aiRecipe.cuisineType,
          tips: aiRecipe.tips
        });
      }

      // 触发图片生成
      const recipeHash = aiRecipe.recipeHash || generateRecipeHash(normalizedName, ingredientNames);
      imageInfo = await getOrGenerateImage(normalizedName, recipeHash);

      if (imageInfo.imageId && !recipe.imageLibraryId) {
        await Recipe.linkImage(recipe.id, imageInfo.imageId);
      }
    } catch (dbError) {
      logger.error('数据库操作失败:', dbError);
      recipe = {
        id: getNextMockId(),
        dishName: aiRecipe.dishName,
        normalizedDishName: normalizedName,
        ingredientsJson: aiRecipe.ingredients,
        mainIngredientsJson: aiRecipe.mainIngredients || null,
        seasoningsJson: aiRecipe.seasonings || null,
        stepsJson: aiRecipe.steps,
        cookingTime: aiRecipe.cookingTime,
        difficulty: aiRecipe.difficulty || 'medium',
        cuisineType: aiRecipe.cuisineType,
        tips: aiRecipe.tips,
        score: aiRecipe.score || 5
      };
      recipeStore.set(normalizedName, recipe);
    }
  }

  return {
    id: recipe.id,
    dishName: recipe.dishName || aiRecipe.dishName,
    normalizedDishName: recipe.normalizedDishName || normalizedName,
    ingredients: recipe.ingredientsJson || aiRecipe.ingredients,
    mainIngredients: recipe.mainIngredientsJson || aiRecipe.mainIngredients || null,
    seasonings: recipe.seasoningsJson || aiRecipe.seasonings || null,
    steps: recipe.stepsJson || aiRecipe.steps,
    cookingTime: recipe.cookingTime || aiRecipe.cookingTime,
    difficulty: recipe.difficulty || aiRecipe.difficulty,
    cuisineType: recipe.cuisineType || aiRecipe.cuisineType,
    tips: recipe.tips || aiRecipe.tips,
    score: aiRecipe.score || 5,
    imageUrl: imageInfo.imageUrl,
    imageId: imageInfo.imageId,
    imagePending: imageInfo.isPending
  };
}

module.exports = {
  getRecommendations,
  refreshRecommendations,
  getRecipeNames: getRecipeNamesForUser,
  getSingleRecipeDetail,
  getRecipeDetail,
  checkImageStatus,
  batchCheckImageStatus
};
