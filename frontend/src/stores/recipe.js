/**
 * 菜谱状态管理
 * 支持分批返回和缓存
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from './user';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const useRecipeStore = defineStore('recipe', () => {
  // 状态
  const recommendations = ref([]);
  const historyRecipes = ref([]); // 所有发现过的菜谱历史
  const currentRecipe = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const needRefresh = ref(false); // 标记是否需要强制刷新（从首页"发现"按钮进入时）

  // 分批相关状态
  const currentBatchIndex = ref(0); // 当前显示的批次（取模后的值）
  const requestBatchIndex = ref(0); // 实际请求的批次（可无限递增，用于循环）
  const totalBatches = ref(0);
  const totalRecipes = ref(0);
  const hasMore = ref(false);
  const fromCache = ref(false);
  const isLooping = ref(false); // 是否已开始循环

  // 计算属性
  const hasRecommendations = computed(() => recommendations.value.length > 0);
  const hasHistory = computed(() => historyRecipes.value.length > 0);

  // 获取用户信息
  const getUserInfo = () => {
    const userStore = useUserStore();
    return {
      userId: userStore.userId,
      sessionId: userStore.sessionId
    };
  };

  // 第一步：获取菜名列表（快速返回）
  // 新逻辑：后端会优先返回数据库已有菜谱，不足再用AI补充
  const getRecipeNames = async () => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      error.value = '请先登录';
      return { success: false };
    }

    loading.value = true;
    error.value = null;

    console.log('[Recipe Store] 第一步：获取菜名列表');

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend/names`,
        method: 'POST',
        timeout: 60000,
        data: { userId, sessionId }
      });

      if (response.data.success) {
        const { names, fromCache: cached, existingRecipes = [] } = response.data.data;

        // 初始化 recommendations
        // 对于来自数据库的菜谱（fromDb=true），直接使用已有数据
        // 对于需要AI生成的菜谱，标记 detailLoading=true
        recommendations.value = names.map((item, index) => {
          // 检查是否有已有菜谱的完整数据
          const existing = existingRecipes.find(r => r.dishName === item.dishName);
          if (existing) {
            console.log(`[Recipe Store] 使用数据库已有菜谱: ${item.dishName}, imageUrl: ${existing.imageUrl || '(无)'}, imagePending: ${existing.imagePending}`);
            return {
              id: existing.id,
              dishName: existing.dishName,
              normalizedDishName: existing.normalizedDishName,
              ingredients: existing.ingredients || [],
              steps: existing.steps || [],
              cookingTime: existing.cookingTime || 0,
              difficulty: existing.difficulty || 'medium',
              cuisineType: existing.cuisineType || '家常菜',
              tips: existing.tips || '',
              imageUrl: existing.imageUrl || '', // 使用后端返回的图片URL
              imageId: existing.imageLibraryId || null,
              imagePending: existing.imagePending || false, // 使用后端返回的状态
              detailLoading: false, // 已有详情，无需加载
              fromDb: true
            };
          }
          // 需要AI生成详情
          return {
            id: `temp_${index}`,
            dishName: item.dishName,
            score: item.score,
            ingredients: [],
            steps: [],
            cookingTime: 0,
            difficulty: '',
            cuisineType: '',
            tips: '',
            imageUrl: '',
            imageId: null,
            imagePending: false,
            detailLoading: true, // 标记详情正在加载
            fromDb: false
          };
        });
        fromCache.value = cached;
        console.log('[Recipe Store] 菜名列表:', names.map(n => `${n.dishName}${n.fromDb ? '(DB)' : ''}`).join('、'));
        return { success: true, names, fromCache: cached, existingRecipes };
      } else {
        error.value = response.data.message;
        return { success: false, message: response.data.message };
      }
    } catch (err) {
      console.error('获取菜名失败:', err);
      error.value = '获取推荐失败，请重试';
      return { success: false, message: error.value };
    } finally {
      loading.value = false;
    }
  };

  // 第二步：获取单个菜谱详情
  const fetchRecipeDetail = async (dishName, score, index) => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      return { success: false };
    }

    console.log(`[Recipe Store] 第二步：获取详情 [${index}] ${dishName}`);

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend/detail`,
        method: 'POST',
        timeout: 60000,
        data: { userId, sessionId, dishName, score }
      });

      if (response.data.success) {
        const recipe = response.data.data;
        // 更新对应位置的菜谱
        if (index < recommendations.value.length) {
          recommendations.value[index] = {
            ...recipe,
            detailLoading: false
          };
        }
        // 添加到历史记录
        addToHistory([recipe]);
        console.log(`[Recipe Store] 详情加载完成 [${index}] ${dishName}`);
        return { success: true, recipe };
      } else {
        // 标记加载失败
        if (index < recommendations.value.length) {
          recommendations.value[index].detailLoading = false;
        }
        return { success: false };
      }
    } catch (err) {
      console.error(`获取详情失败 [${index}] ${dishName}:`, err);
      if (index < recommendations.value.length) {
        recommendations.value[index].detailLoading = false;
      }
      return { success: false };
    }
  };

  // 分步获取推荐（先菜名，再逐个详情）
  // 新逻辑：对于来自数据库的菜谱，跳过详情加载
  const getRecommendationsStepByStep = async () => {
    // 第一步：获取菜名（后端会优先返回数据库已有菜谱）
    const namesResult = await getRecipeNames();
    if (!namesResult.success) {
      return namesResult;
    }

    // 第二步：只对需要加载详情的菜谱调用API
    const names = namesResult.names;
    const dbRecipes = []; // 收集来自数据库的菜谱

    for (let i = 0; i < names.length; i++) {
      // 检查是否来自数据库（已有完整数据）
      if (names[i].fromDb) {
        console.log(`[Recipe Store] 跳过详情加载（来自数据库）: ${names[i].dishName}`);
        // 收集来自数据库的菜谱，稍后添加到历史记录
        if (recommendations.value[i]) {
          dbRecipes.push(recommendations.value[i]);
        }
        continue;
      }
      await fetchRecipeDetail(names[i].dishName, names[i].score, i);
    }

    // 将来自数据库的菜谱也添加到历史记录
    if (dbRecipes.length > 0) {
      addToHistory(dbRecipes);
    }

    return { success: true, data: recommendations.value };
  };

  // 兼容旧接口（一次性获取全部）
  const getRecommendations = async (options = {}) => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      error.value = '请先登录';
      return { success: false };
    }

    loading.value = true;
    error.value = null;

    console.log('[Recipe Store] 发起推荐请求，userId:', userId, 'sessionId:', sessionId);

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend`,
        method: 'POST',
        timeout: 120000, // 2分钟超时，AI推荐可能需要较长时间
        data: {
          userId,
          sessionId,
          batchIndex: 0, // 首次获取从第0批开始
          preferences: options.preferences
        }
      });

      console.log('[Recipe Store] 推荐响应:', response.data);

      if (response.data.success) {
        const data = response.data.data;
        recommendations.value = data.recipes;
        currentBatchIndex.value = data.batchIndex;
        requestBatchIndex.value = 0; // 首次请求重置
        totalBatches.value = data.totalBatches;
        totalRecipes.value = data.totalRecipes || 0;
        hasMore.value = data.hasMore;
        fromCache.value = data.fromCache;
        isLooping.value = data.isLooping || false;
        // 添加到历史记录（去重）
        addToHistory(data.recipes);
        return { success: true, data: data.recipes, hasMore: data.hasMore };
      } else {
        error.value = response.data.message;
        return { success: false, message: response.data.message };
      }
    } catch (err) {
      console.error('获取推荐失败:', err);
      error.value = '获取推荐失败，请重试';
      return { success: false, message: error.value };
    } finally {
      loading.value = false;
    }
  };

  // 换一批推荐（获取下一批，支持循环）
  const refreshRecommendations = async () => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      error.value = '请先登录';
      return { success: false };
    }

    loading.value = true;
    error.value = null;

    try {
      // 使用 requestBatchIndex 来实现无限循环
      const nextRequestIndex = requestBatchIndex.value + 1;

      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend/refresh`,
        method: 'POST',
        data: {
          userId,
          sessionId,
          currentBatchIndex: nextRequestIndex - 1 // 后端需要的是"当前"批次，它会+1
        }
      });

      if (response.data.success) {
        const data = response.data.data;
        recommendations.value = data.recipes;
        currentBatchIndex.value = data.batchIndex;
        requestBatchIndex.value = nextRequestIndex; // 递增请求批次
        totalBatches.value = data.totalBatches;
        totalRecipes.value = data.totalRecipes || 0;
        hasMore.value = data.hasMore;
        fromCache.value = data.fromCache;
        isLooping.value = data.isLooping || false;
        // 添加到历史记录（去重）
        addToHistory(data.recipes);
        return { success: true, data: data.recipes, hasMore: data.hasMore, isLooping: data.isLooping };
      } else {
        error.value = response.data.message;
        return { success: false, message: response.data.message };
      }
    } catch (err) {
      console.error('刷新推荐失败:', err);
      error.value = '刷新推荐失败，请重试';
      return { success: false, message: error.value };
    } finally {
      loading.value = false;
    }
  };

  // 获取菜谱详情
  const getRecipeDetail = async (recipeId) => {
    // 先从本地推荐列表查找（Mock模式或离线场景）
    const localRecipe = recommendations.value.find(r => String(r.id) === String(recipeId));
    if (localRecipe) {
      currentRecipe.value = localRecipe;
      return { success: true, data: localRecipe };
    }

    // 本地没有，尝试从 API 获取
    const { userId } = getUserInfo();

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recipes/${recipeId}`,
        method: 'GET',
        data: { userId }
      });

      if (response.data.success) {
        currentRecipe.value = response.data.data;
        return { success: true, data: response.data.data };
      } else {
        return { success: false, message: response.data.message };
      }
    } catch (err) {
      console.error('获取详情失败:', err);
      return { success: false, message: '获取详情失败' };
    }
  };

  // 检查图片状态
  const checkImageStatus = async (imageId) => {
    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend/image-status/${imageId}`,
        method: 'GET'
      });

      if (response.data.success) {
        return response.data.data;
      }
      return { ready: false, imageUrl: '' };
    } catch (err) {
      console.error('检查图片状态失败:', err);
      return { ready: false, imageUrl: '' };
    }
  };

  // 批量检查图片状态
  const batchCheckImageStatus = async (imageIds) => {
    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend/image-status/batch`,
        method: 'POST',
        data: { imageIds }
      });

      if (response.data.success) {
        return response.data.data;
      }
      return {};
    } catch (err) {
      console.error('批量检查图片状态失败:', err);
      return {};
    }
  };

  // 更新推荐中的图片URL（同时更新历史记录）
  const updateImageUrl = (recipeId, imageUrl) => {
    // 更新 recommendations
    const index = recommendations.value.findIndex(r => r.id === recipeId);
    if (index !== -1) {
      recommendations.value[index].imageUrl = imageUrl;
      recommendations.value[index].imagePending = false;
    }
    // 同时更新 historyRecipes
    const historyIndex = historyRecipes.value.findIndex(r => r.id === recipeId);
    if (historyIndex !== -1) {
      historyRecipes.value[historyIndex].imageUrl = imageUrl;
      historyRecipes.value[historyIndex].imagePending = false;
    }
  };

  // 添加到历史记录（去重，新的在前面，已存在则更新图片URL）
  const addToHistory = (recipes) => {
    const existingIds = new Set(historyRecipes.value.map(r => r.id));
    const newRecipes = [];

    for (const recipe of recipes) {
      if (existingIds.has(recipe.id)) {
        // 已存在，更新图片URL（如果有新值）
        const historyIndex = historyRecipes.value.findIndex(r => r.id === recipe.id);
        if (historyIndex !== -1 && recipe.imageUrl) {
          historyRecipes.value[historyIndex].imageUrl = recipe.imageUrl;
          historyRecipes.value[historyIndex].imagePending = recipe.imagePending || false;
        }
      } else {
        // 新菜谱，添加到列表
        newRecipes.push(recipe);
      }
    }

    if (newRecipes.length > 0) {
      historyRecipes.value = [...newRecipes, ...historyRecipes.value];
    }
  };

  // 清空推荐
  const clearRecommendations = () => {
    recommendations.value = [];
    currentRecipe.value = null;
    currentBatchIndex.value = 0;
    requestBatchIndex.value = 0;
    totalBatches.value = 0;
    totalRecipes.value = 0;
    hasMore.value = false;
    isLooping.value = false;
  };

  // 标记需要刷新（从首页"发现"按钮触发）
  const markNeedRefresh = () => {
    needRefresh.value = true;
    // 清空之前的推荐，强制重新生成
    recommendations.value = [];
    currentBatchIndex.value = 0;
    requestBatchIndex.value = 0;
    totalBatches.value = 0;
    totalRecipes.value = 0;
    hasMore.value = false;
    isLooping.value = false;
  };

  // 消费刷新标记
  const consumeNeedRefresh = () => {
    const need = needRefresh.value;
    needRefresh.value = false;
    return need;
  };

  return {
    recommendations,
    historyRecipes,
    currentRecipe,
    loading,
    error,
    hasRecommendations,
    hasHistory,
    needRefresh,
    // 分批相关状态
    currentBatchIndex,
    requestBatchIndex,
    totalBatches,
    totalRecipes,
    hasMore,
    fromCache,
    isLooping,
    // 方法
    getRecommendations,
    getRecommendationsStepByStep,
    getRecipeNames,
    fetchRecipeDetail,
    refreshRecommendations,
    getRecipeDetail,
    checkImageStatus,
    batchCheckImageStatus,
    updateImageUrl,
    clearRecommendations,
    markNeedRefresh,
    consumeNeedRefresh
  };
});
