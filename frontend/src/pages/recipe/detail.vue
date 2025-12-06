<template>
  <view class="page-container">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-container">
      <view class="loading-spinner"></view>
      <text>加载中...</text>
    </view>

    <!-- 菜谱详情 -->
    <view v-else-if="recipe" class="recipe-detail">
      <!-- 固定顶部按钮 -->
      <view class="fixed-buttons">
        <!-- 返回按钮 -->
        <view class="back-button" @click="goBack">
          <text class="back-icon">←</text>
        </view>

        <!-- 收藏按钮 -->
        <view
          class="favorite-button"
          :class="{ active: recipe.isFavorited }"
          @click="toggleFavorite"
        >
          <text class="favorite-icon">{{ recipe.isFavorited ? '❤️' : '🤍' }}</text>
        </view>
      </view>

      <!-- 顶部图片 -->
      <view class="header-image">
        <image
          v-if="recipe.imageUrl"
          :src="recipe.imageUrl"
          mode="aspectFill"
          class="dish-image"
        />
        <view v-else class="image-placeholder">
          <text class="placeholder-text">{{ recipe.dishName?.charAt(0) }}</text>
        </view>
      </view>

      <!-- 基本信息 -->
      <view class="info-section">
        <text class="dish-name">{{ recipe.dishName }}</text>

        <view class="meta-row">
          <view class="meta-item">
            <text class="meta-label">烹饪时间</text>
            <text class="meta-value">{{ recipe.cookingTime || '—' }}分钟</text>
          </view>
          <view class="meta-divider"></view>
          <view class="meta-item">
            <text class="meta-label">难度</text>
            <text class="meta-value">{{ difficultyText(recipe.difficulty) }}</text>
          </view>
          <view class="meta-divider"></view>
          <view class="meta-item">
            <text class="meta-label">菜系</text>
            <text class="meta-value">{{ recipe.cuisineType || '家常菜' }}</text>
          </view>
        </view>
      </view>

      <!-- 主食材 -->
      <view class="section">
        <text class="section-title">主食材</text>
        <view class="ingredient-list">
          <view
            v-for="(ing, index) in mainIngredientsList"
            :key="'main-' + index"
            class="ingredient-item main-ingredient"
          >
            <text class="ing-name">{{ ing.name || ing }}</text>
            <text class="ing-amount">{{ ing.amount || '适量' }}</text>
          </view>
        </view>
      </view>

      <!-- 配料/佐料 -->
      <view v-if="seasoningsList.length > 0" class="section">
        <text class="section-title">配料/佐料</text>
        <view class="ingredient-list">
          <view
            v-for="(ing, index) in seasoningsList"
            :key="'seasoning-' + index"
            class="ingredient-item seasoning"
          >
            <text class="ing-name">{{ ing.name || ing }}</text>
            <text class="ing-amount">{{ ing.amount || '适量' }}</text>
          </view>
        </view>
      </view>

      <!-- 制作步骤 -->
      <view class="section">
        <text class="section-title">制作步骤</text>
        <view class="steps-list">
          <view
            v-for="(step, index) in recipe.steps"
            :key="index"
            class="step-item"
          >
            <view class="step-number">{{ index + 1 }}</view>
            <text class="step-content">{{ step }}</text>
          </view>
        </view>
      </view>

      <!-- 小贴士 -->
      <view v-if="recipe.tips" class="section tips-section">
        <text class="section-title">小贴士</text>
        <text class="tips-content">{{ recipe.tips }}</text>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-container">
      <text class="error-text">菜谱加载失败</text>
      <button class="retry-btn" @click="loadRecipe">重试</button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRecipeStore } from '@/stores/recipe';
import { useUserStore } from '@/stores/user';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Stores
const recipeStore = useRecipeStore();
const userStore = useUserStore();

// 状态
const loading = ref(true);
const recipe = ref(null);
const recipeId = ref(null);

// 计算主食材列表
const mainIngredientsList = computed(() => {
  if (!recipe.value) return [];

  // 优先使用 mainIngredients 字段
  if (recipe.value.mainIngredients && recipe.value.mainIngredients.length > 0) {
    return recipe.value.mainIngredients;
  }

  // 兼容旧数据：从 ingredients 中筛选 isMain=true 的
  if (recipe.value.ingredients && recipe.value.ingredients.length > 0) {
    const mainOnes = recipe.value.ingredients.filter(i => i.isMain === true);
    // 如果没有标记 isMain，返回全部（旧数据兼容）
    if (mainOnes.length === 0) {
      return recipe.value.ingredients;
    }
    return mainOnes;
  }

  return [];
});

// 计算配料列表
const seasoningsList = computed(() => {
  if (!recipe.value) return [];

  // 优先使用 seasonings 字段
  if (recipe.value.seasonings && recipe.value.seasonings.length > 0) {
    return recipe.value.seasonings;
  }

  // 兼容旧数据：从 ingredients 中筛选 isMain=false 的
  if (recipe.value.ingredients && recipe.value.ingredients.length > 0) {
    return recipe.value.ingredients.filter(i => i.isMain === false);
  }

  return [];
});

// 难度文本映射
const difficultyText = (difficulty) => {
  const map = {
    easy: '简单',
    medium: '适中',
    hard: '复杂'
  };
  return map[difficulty] || '适中';
};

// 初始化
onMounted(() => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  recipeId.value = currentPage.options?.id;

  if (recipeId.value) {
    loadRecipe();
  } else {
    loading.value = false;
  }
});

// 加载菜谱详情
const loadRecipe = async () => {
  loading.value = true;

  try {
    const result = await recipeStore.getRecipeDetail(recipeId.value);

    if (result.success) {
      recipe.value = result.data;
    } else {
      uni.showToast({
        title: result.message || '加载失败',
        icon: 'none'
      });
    }
  } catch (err) {
    console.error('加载菜谱失败:', err);
  } finally {
    loading.value = false;
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 切换收藏
const toggleFavorite = async () => {
  if (!userStore.isLoggedIn) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    });
    return;
  }

  try {
    const response = await uni.request({
      url: `${API_BASE_URL}/api/favorites/toggle`,
      method: 'POST',
      data: {
        userId: userStore.userId,
        recipeId: recipe.value.id
      }
    });

    if (response.data.success) {
      recipe.value.isFavorited = response.data.data.isFavorited;

      uni.showToast({
        title: response.data.data.isFavorited ? '已收藏' : '已取消收藏',
        icon: 'success'
      });
    }
  } catch (err) {
    console.error('收藏操作失败:', err);
    uni.showToast({
      title: '操作失败',
      icon: 'none'
    });
  }
};
</script>

<style lang="scss" scoped>
.page-container {
  height: 100vh;
  background: #f5f7fa;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: #666;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid #ddd;
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 24rpx;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.recipe-detail {
  padding-bottom: 64rpx;
}

.fixed-buttons {
  position: fixed;
  top: 80rpx;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  padding: 0 24rpx;
  pointer-events: none;

  > view {
    pointer-events: auto;
  }
}

.header-image {
  position: relative;
  width: 100%;
  height: 480rpx;
}

.dish-image {
  width: 100%;
  height: 100%;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #a8e6cf 0%, #88d8b0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 160rpx;
  color: white;
  font-weight: bold;
}

.back-button {
  width: 72rpx;
  height: 72rpx;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-icon {
  color: white;
  font-size: 40rpx;
}

.favorite-button {
  width: 72rpx;
  height: 72rpx;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active {
    background: #fff0f0;
  }
}

.favorite-icon {
  font-size: 36rpx;
}

.info-section {
  background: white;
  padding: 32rpx;
  margin-top: -32rpx;
  border-radius: 32rpx 32rpx 0 0;
  position: relative;
}

.dish-name {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 24rpx;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 24rpx 0;
  border-top: 1rpx solid #eee;
}

.meta-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.meta-label {
  font-size: 24rpx;
  color: #999;
  margin-bottom: 8rpx;
}

.meta-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.meta-divider {
  width: 1rpx;
  height: 48rpx;
  background: #eee;
}

.section {
  background: white;
  margin-top: 24rpx;
  padding: 32rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 24rpx;
}

.ingredient-list {
  display: flex;
  flex-direction: column;
}

.ingredient-item {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }

  &.main-ingredient {
    .ing-name {
      font-weight: 500;
      color: #333;
    }
  }

  &.seasoning {
    .ing-name {
      color: #666;
    }
    .ing-amount {
      color: #aaa;
    }
  }
}

.ing-name {
  font-size: 28rpx;
  color: #333;
}

.ing-amount {
  font-size: 28rpx;
  color: #999;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.step-item {
  display: flex;
  gap: 20rpx;
}

.step-number {
  width: 48rpx;
  height: 48rpx;
  background: #4CAF50;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: bold;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
}

.tips-section {
  background: #fff9e6;
  border-left: 6rpx solid #ffc107;
}

.tips-content {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.error-text {
  font-size: 30rpx;
  color: #666;
  margin-bottom: 24rpx;
}

.retry-btn {
  padding: 0 48rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: #4CAF50;
  color: white;
  border-radius: 40rpx;
  font-size: 28rpx;
}
</style>
