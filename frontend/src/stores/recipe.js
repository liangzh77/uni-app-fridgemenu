/**
 * 菜谱状态管理
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
  const excludedIds = ref([]); // 已排除的菜谱ID（用于换一批）
  const needRefresh = ref(false); // 标记是否需要强制刷新（从首页"发现"按钮进入时）

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

  // 获取菜谱推荐
  const getRecommendations = async (options = {}) => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      error.value = '请先登录';
      return { success: false };
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend`,
        method: 'POST',
        data: {
          userId,
          sessionId,
          count: options.count || 3,
          preferences: options.preferences
        }
      });

      if (response.data.success) {
        recommendations.value = response.data.data;
        // 记录这些菜谱ID，用于后续排除
        excludedIds.value = [...new Set([
          ...excludedIds.value,
          ...response.data.data.map(r => r.id)
        ])];
        // 添加到历史记录（去重）
        addToHistory(response.data.data);
        return { success: true, data: response.data.data };
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

  // 换一批推荐
  const refreshRecommendations = async () => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      error.value = '请先登录';
      return { success: false };
    }

    loading.value = true;
    error.value = null;

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/recommend/refresh`,
        method: 'POST',
        data: {
          userId,
          sessionId,
          excludeIds: excludedIds.value,
          count: 3
        }
      });

      if (response.data.success) {
        recommendations.value = response.data.data;
        // 更新排除列表
        excludedIds.value = [...new Set([
          ...excludedIds.value,
          ...response.data.data.map(r => r.id)
        ])];
        // 添加到历史记录（去重）
        addToHistory(response.data.data);
        return { success: true, data: response.data.data };
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

  // 更新推荐中的图片URL
  const updateImageUrl = (recipeId, imageUrl) => {
    const index = recommendations.value.findIndex(r => r.id === recipeId);
    if (index !== -1) {
      recommendations.value[index].imageUrl = imageUrl;
      recommendations.value[index].imagePending = false;
    }
  };

  // 添加到历史记录（去重，新的在前面）
  const addToHistory = (recipes) => {
    const existingIds = new Set(historyRecipes.value.map(r => r.id));
    const newRecipes = recipes.filter(r => !existingIds.has(r.id));
    if (newRecipes.length > 0) {
      historyRecipes.value = [...newRecipes, ...historyRecipes.value];
    }
  };

  // 清空推荐
  const clearRecommendations = () => {
    recommendations.value = [];
    excludedIds.value = [];
    currentRecipe.value = null;
  };

  // 标记需要刷新（从首页"发现"按钮触发）
  const markNeedRefresh = () => {
    needRefresh.value = true;
    // 清空之前的推荐，强制重新生成
    recommendations.value = [];
    excludedIds.value = [];
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
    excludedIds,
    needRefresh,
    getRecommendations,
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
