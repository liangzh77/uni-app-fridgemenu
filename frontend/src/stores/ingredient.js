/**
 * 食材状态管理
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from './user';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const useIngredientStore = defineStore('ingredient', () => {
  // 状态
  const ingredients = ref([]);
  const loading = ref(false);
  const error = ref(null);

  // 计算属性
  const ingredientCount = computed(() => ingredients.value.length);
  const ingredientNames = computed(() => ingredients.value.map(i => i.name));
  const hasIngredients = computed(() => ingredients.value.length > 0);

  // 获取用户信息
  const getUserInfo = () => {
    const userStore = useUserStore();
    return {
      userId: userStore.userId,
      sessionId: userStore.sessionId
    };
  };

  // 加载食材列表
  const loadIngredients = async () => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) return;

    loading.value = true;
    error.value = null;

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/ingredients`,
        method: 'GET',
        data: { userId, sessionId }
      });

      if (response.data.success) {
        ingredients.value = response.data.data;
      } else {
        error.value = response.data.message;
      }
    } catch (err) {
      console.error('加载食材失败:', err);
      error.value = '加载失败，请重试';
    } finally {
      loading.value = false;
    }
  };

  // 添加食材（支持批量）
  const addIngredients = async (newIngredients) => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      error.value = '请先登录';
      return { success: false, message: '请先登录' };
    }

    const ingredientList = Array.isArray(newIngredients) ? newIngredients : [newIngredients];

    loading.value = true;
    error.value = null;

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/ingredients`,
        method: 'POST',
        data: {
          userId,
          sessionId,
          ingredients: ingredientList
        }
      });

      if (response.data.success) {
        // 添加到本地列表
        const created = response.data.data.created || [];
        ingredients.value = [...ingredients.value, ...created];

        return {
          success: true,
          created: created.length,
          skipped: response.data.data.skipped?.length || 0,
          message: response.data.message
        };
      } else {
        error.value = response.data.message;
        return { success: false, message: response.data.message };
      }
    } catch (err) {
      console.error('添加食材失败:', err);
      error.value = '添加失败，请重试';
      return { success: false, message: '添加失败，请重试' };
    } finally {
      loading.value = false;
    }
  };

  // 删除食材
  const deleteIngredient = async (ingredientId) => {
    const { userId, sessionId } = getUserInfo();
    if (!userId) return false;

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/ingredients/${ingredientId}?userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId || '')}`,
        method: 'DELETE'
      });

      if (response.data.success) {
        // 从本地列表移除
        ingredients.value = ingredients.value.filter(i => i.id !== ingredientId);
        return true;
      } else {
        error.value = response.data.message;
        return false;
      }
    } catch (err) {
      console.error('删除食材失败:', err);
      error.value = '删除失败，请重试';
      return false;
    }
  };

  // 清空所有食材
  const clearIngredients = async () => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) return false;

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/ingredients?userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}`,
        method: 'DELETE'
      });

      if (response.data.success) {
        ingredients.value = [];
        return true;
      } else {
        error.value = response.data.message;
        return false;
      }
    } catch (err) {
      console.error('清空食材失败:', err);
      error.value = '清空失败，请重试';
      return false;
    }
  };

  // 解析语音文本中的食材
  const parseVoiceText = async (text) => {
    const { userId, sessionId } = getUserInfo();
    if (!userId || !sessionId) {
      return { success: false, ingredients: [] };
    }

    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/voice/parse`,
        method: 'POST',
        data: {
          userId,
          sessionId,
          text
        }
      });

      if (response.data.success) {
        return {
          success: true,
          ingredients: response.data.data.ingredients || []
        };
      } else {
        return { success: false, ingredients: [] };
      }
    } catch (err) {
      console.error('解析语音失败:', err);
      return { success: false, ingredients: [] };
    }
  };

  // 本地解析语音文本（备用方案）
  const parseVoiceTextLocal = (text) => {
    // 简单的本地解析逻辑
    // 去除常见的非食材词汇
    const stopWords = ['我有', '家里有', '冰箱里有', '还有', '和', '跟', '以及', '一些', '几个', '点'];
    let cleanText = text;
    stopWords.forEach(word => {
      cleanText = cleanText.replace(new RegExp(word, 'g'), ' ');
    });

    // 按空格、逗号、顿号分割
    const parts = cleanText.split(/[,，、\s]+/).filter(p => p.trim());

    // 过滤掉太短或太长的词
    const ingredients = parts
      .map(p => p.trim())
      .filter(p => p.length >= 1 && p.length <= 10);

    return ingredients;
  };

  return {
    ingredients,
    loading,
    error,
    ingredientCount,
    ingredientNames,
    hasIngredients,
    loadIngredients,
    addIngredients,
    deleteIngredient,
    clearIngredients,
    parseVoiceText,
    parseVoiceTextLocal
  };
});
