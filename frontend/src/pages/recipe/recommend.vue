<template>
  <view class="page-container">
    <!-- 加载状态 -->
    <view v-if="recipeStore.loading && !hasRecipes" class="loading-container">
      <view class="loading-spinner"></view>
      <text class="loading-text">AI正在为您推荐菜谱...</text>
      <text class="loading-hint">根据您的食材搭配中</text>
    </view>

    <!-- 推荐结果 -->
    <view v-else-if="hasRecipes" class="recipe-list">
      <!-- 食材提示 -->
      <view class="ingredient-hint">
        <text>根据食材: </text>
        <text class="ingredients-text">{{ ingredientNames }}</text>
      </view>

      <!-- 菜谱卡片 -->
      <view
        v-for="(recipe, index) in recipeStore.recommendations"
        :key="recipe.id"
        class="recipe-card"
        @click="viewDetail(recipe)"
      >
        <!-- 图片区域 -->
        <view class="card-image">
          <image
            v-if="recipe.imageUrl"
            :src="recipe.imageUrl"
            mode="aspectFill"
            class="recipe-image"
          />
          <view v-else class="image-placeholder">
            <view v-if="recipe.imagePending" class="image-loading">
              <view class="mini-spinner"></view>
              <text>图片生成中</text>
            </view>
            <text v-else class="placeholder-text">{{ recipe.dishName.charAt(0) }}</text>
          </view>
        </view>

        <!-- 信息区域 -->
        <view class="card-info">
          <text class="dish-name">{{ recipe.dishName }}</text>

          <view class="meta-row">
            <view class="meta-item">
              <text class="meta-icon">⏱️</text>
              <text>{{ recipe.cookingTime || '—' }}分钟</text>
            </view>
            <view class="meta-item">
              <text class="meta-icon">📊</text>
              <text>{{ difficultyText(recipe.difficulty) }}</text>
            </view>
            <view class="meta-item">
              <text class="meta-icon">🍽️</text>
              <text>{{ recipe.cuisineType || '家常菜' }}</text>
            </view>
          </view>

          <view class="ingredient-tags">
            <text
              v-for="(ing, i) in recipe.ingredients?.slice(0, 4)"
              :key="i"
              class="ingredient-tag"
            >
              {{ ing.name || ing }}
            </text>
            <text v-if="recipe.ingredients?.length > 4" class="more-tag">
              +{{ recipe.ingredients.length - 4 }}
            </text>
          </view>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-buttons">
        <button
          class="refresh-btn"
          :disabled="recipeStore.loading"
          @click="handleRefresh"
        >
          {{ recipeStore.loading ? '加载中...' : '换一批' }}
        </button>
        <button
          class="back-btn"
          @click="goBack"
        >
          返回修改食材
        </button>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-container">
      <image src="/static/icons/empty-recipe.png" mode="aspectFit" class="empty-icon" />
      <text class="empty-text">未能获取推荐</text>
      <text class="empty-hint">{{ recipeStore.error || '请返回添加食材后重试' }}</text>
      <button class="retry-btn" @click="loadRecommendations">重试</button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRecipeStore } from '@/stores/recipe';
import { useIngredientStore } from '@/stores/ingredient';

// Stores
const recipeStore = useRecipeStore();
const ingredientStore = useIngredientStore();

// 状态
const imagePollingTimer = ref(null);
const lastRefreshTime = ref(0);

// 计算属性
const hasRecipes = computed(() => recipeStore.recommendations.length > 0);
const ingredientNames = computed(() => {
  return ingredientStore.ingredientNames.join('、') || '无';
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
onMounted(async () => {
  await loadRecommendations();
  startImagePolling();
});

// 清理
onUnmounted(() => {
  stopImagePolling();
});

// 加载推荐
const loadRecommendations = async () => {
  const result = await recipeStore.getRecommendations();

  if (!result.success) {
    uni.showToast({
      title: result.message || '获取推荐失败',
      icon: 'none'
    });
  }
};

// 刷新推荐（换一批）带防抖
const handleRefresh = async () => {
  // 防抖检查 (TASK-043.1)
  const now = Date.now();
  if (now - lastRefreshTime.value < 2000) {
    uni.showToast({
      title: '请稍候再试',
      icon: 'none'
    });
    return;
  }
  lastRefreshTime.value = now;

  const result = await recipeStore.refreshRecommendations();

  if (result.success) {
    uni.showToast({
      title: '已为您换一批推荐',
      icon: 'success'
    });
    // 重新开始图片轮询
    startImagePolling();
  } else {
    uni.showToast({
      title: result.message || '刷新失败',
      icon: 'none'
    });
  }
};

// 查看详情
const viewDetail = (recipe) => {
  uni.navigateTo({
    url: `/pages/recipe/detail?id=${recipe.id}`
  });
};

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 图片状态轮询
const startImagePolling = () => {
  stopImagePolling();

  imagePollingTimer.value = setInterval(async () => {
    const pendingRecipes = recipeStore.recommendations.filter(r => r.imagePending && r.imageId);

    if (pendingRecipes.length === 0) {
      stopImagePolling();
      return;
    }

    const imageIds = pendingRecipes.map(r => r.imageId);
    const statusMap = await recipeStore.batchCheckImageStatus(imageIds);

    // 更新已完成的图片
    for (const recipe of pendingRecipes) {
      const status = statusMap[recipe.imageId];
      if (status?.ready && status.imageUrl) {
        recipeStore.updateImageUrl(recipe.id, status.imageUrl);
      }
    }
  }, 3000); // 每3秒检查一次
};

const stopImagePolling = () => {
  if (imagePollingTimer.value) {
    clearInterval(imagePollingTimer.value);
    imagePollingTimer.value = null;
  }
};
</script>

<style lang="scss" scoped>
.page-container {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 32rpx;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 64rpx;
}

.loading-spinner {
  width: 80rpx;
  height: 80rpx;
  border: 6rpx solid #ddd;
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 32rpx;
  color: #333;
  margin-top: 32rpx;
}

.loading-hint {
  font-size: 26rpx;
  color: #999;
  margin-top: 16rpx;
}

.recipe-list {
  padding: 24rpx;
}

.ingredient-hint {
  background: white;
  padding: 20rpx 24rpx;
  border-radius: 12rpx;
  margin-bottom: 24rpx;
  font-size: 26rpx;
  color: #666;

  .ingredients-text {
    color: #4CAF50;
    font-weight: 500;
  }
}

.recipe-card {
  background: white;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);

  &:active {
    opacity: 0.9;
  }
}

.card-image {
  width: 100%;
  height: 320rpx;
  position: relative;
}

.recipe-image {
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
  font-size: 120rpx;
  color: white;
  font-weight: bold;
}

.image-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: white;
  font-size: 24rpx;

  .mini-spinner {
    width: 48rpx;
    height: 48rpx;
    border: 4rpx solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12rpx;
  }
}

.card-info {
  padding: 24rpx;
}

.dish-name {
  font-size: 36rpx;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 16rpx;
}

.meta-row {
  display: flex;
  gap: 24rpx;
  margin-bottom: 16rpx;
}

.meta-item {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  color: #666;

  .meta-icon {
    margin-right: 6rpx;
  }
}

.ingredient-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.ingredient-tag {
  padding: 8rpx 16rpx;
  background: #f0f9f0;
  border-radius: 20rpx;
  font-size: 22rpx;
  color: #4CAF50;
}

.more-tag {
  padding: 8rpx 16rpx;
  background: #f5f5f5;
  border-radius: 20rpx;
  font-size: 22rpx;
  color: #999;
}

.action-buttons {
  display: flex;
  gap: 24rpx;
  margin-top: 32rpx;
}

.refresh-btn,
.back-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: 500;
}

.refresh-btn {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;

  &:disabled {
    background: #ccc;
  }
}

.back-btn {
  background: white;
  color: #666;
  border: 2rpx solid #ddd;
}

.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 64rpx;
}

.empty-icon {
  width: 200rpx;
  height: 200rpx;
  opacity: 0.5;
}

.empty-text {
  font-size: 32rpx;
  color: #666;
  margin-top: 32rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: #999;
  margin-top: 16rpx;
}

.retry-btn {
  margin-top: 32rpx;
  padding: 0 48rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: #4CAF50;
  color: white;
  border-radius: 40rpx;
  font-size: 28rpx;
}
</style>
