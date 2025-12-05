<template>
  <view class="recipe-list-container">
    <!-- 顶部栏 -->
    <view v-if="showTopBar" class="top-bar">
      <!-- 返回按钮 -->
      <view v-if="showBack" class="back-btn" @click="handleBack">
        <text class="back-icon">←</text>
      </view>

      <!-- 食材横向滚动（推荐模式） -->
      <scroll-view v-if="ingredientNames.length > 0" class="ingredient-scroll" scroll-x enable-flex>
        <view class="ingredient-scroll-content">
          <text
            v-for="(name, index) in ingredientNames"
            :key="index"
            class="ingredient-chip"
          >
            {{ name }}
          </text>
        </view>
      </scroll-view>

      <!-- 标题（收藏模式） -->
      <view v-else class="title-area">
        <text class="title-text">{{ title }}</text>
      </view>

      <!-- 刷新按钮 -->
      <view v-if="showRefresh" class="refresh-icon" @click="handleRefresh" :class="{ disabled: loading }">
        <text>🔄</text>
      </view>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading && recipes.length === 0" class="loading-container">
      <view class="loading-spinner"></view>
      <text class="loading-text">{{ loadingText }}</text>
    </view>

    <!-- 菜谱列表 -->
    <view v-else-if="recipes.length > 0" class="recipe-list">
      <view
        v-for="recipe in recipes"
        :key="recipe.id"
        class="recipe-row"
        @click="handleRecipeClick(recipe)"
      >
        <!-- 缩略图 -->
        <view class="row-image">
          <image
            v-if="recipe.imageUrl"
            :src="recipe.imageUrl"
            mode="aspectFill"
            class="thumb-image"
          />
          <view v-else class="thumb-placeholder">
            <view v-if="recipe.imagePending" class="mini-spinner"></view>
            <text v-else class="thumb-text">{{ recipe.dishName.charAt(0) }}</text>
          </view>
        </view>

        <!-- 信息区域 -->
        <view class="row-info">
          <text class="row-dish-name">{{ recipe.dishName }}</text>
          <text class="row-ingredients">{{ formatIngredients(recipe.ingredients) }}</text>
        </view>

        <!-- 箭头 -->
        <text class="row-arrow">›</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-container">
      <text class="empty-text">{{ emptyText }}</text>
      <text class="empty-hint">{{ emptyHint }}</text>
      <button v-if="showRetry" class="retry-btn" @click="handleRetry">重试</button>
    </view>
  </view>
</template>

<script setup>
// Props
const props = defineProps({
  // 菜谱列表
  recipes: {
    type: Array,
    default: () => []
  },
  // 是否加载中
  loading: {
    type: Boolean,
    default: false
  },
  // 加载文案
  loadingText: {
    type: String,
    default: '加载中...'
  },
  // 空状态标题
  emptyText: {
    type: String,
    default: '暂无数据'
  },
  // 空状态提示
  emptyHint: {
    type: String,
    default: ''
  },
  // 是否显示顶部栏
  showTopBar: {
    type: Boolean,
    default: true
  },
  // 标题（收藏模式用）
  title: {
    type: String,
    default: ''
  },
  // 食材名称列表（推荐模式用）
  ingredientNames: {
    type: Array,
    default: () => []
  },
  // 是否显示返回按钮
  showBack: {
    type: Boolean,
    default: false
  },
  // 是否显示刷新按钮
  showRefresh: {
    type: Boolean,
    default: true
  },
  // 是否显示重试按钮
  showRetry: {
    type: Boolean,
    default: true
  }
});

// Events
const emit = defineEmits(['back', 'refresh', 'retry', 'recipe-click']);

// 格式化食材列表为简短字符串
const formatIngredients = (ingredients) => {
  if (!ingredients || ingredients.length === 0) return '';
  const names = ingredients.slice(0, 5).map(i => i.name || i);
  let result = names.join('、');
  if (ingredients.length > 5) {
    result += `...等${ingredients.length}种`;
  }
  return result;
};

// 事件处理
const handleBack = () => emit('back');
const handleRefresh = () => !props.loading && emit('refresh');
const handleRetry = () => emit('retry');
const handleRecipeClick = (recipe) => emit('recipe-click', recipe);
</script>

<style lang="scss" scoped>
.recipe-list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f5f7fa;
}

// 顶部栏
.top-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  background: white;
  border-bottom: 1px solid #eee;
}

.back-btn {
  flex-shrink: 0;
  width: 100rpx;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 50%;

  .back-icon {
    font-size: 64rpx;
    font-weight: bold;
    color: #666;
  }

  &:active {
    background: #e8e8e8;
  }
}

.ingredient-scroll {
  flex: 1;
  white-space: nowrap;
}

.ingredient-scroll-content {
  display: inline-flex;
  gap: 12rpx;
}

.ingredient-chip {
  display: inline-block;
  padding: 10rpx 20rpx;
  background: #e8f5e9;
  border-radius: 24rpx;
  font-size: 26rpx;
  color: #4CAF50;
  white-space: nowrap;
}

.title-area {
  flex: 1;
}

.title-text {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.refresh-icon {
  flex-shrink: 0;
  width: 100rpx;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 50%;
  font-size: 48rpx;

  &:active {
    background: #e8e8e8;
  }

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
  font-size: 28rpx;
  color: #666;
  margin-top: 24rpx;
}

.recipe-list {
  flex: 1;
  overflow-y: auto;
  padding: 20rpx 24rpx;
}

// 菜谱行样式
.recipe-row {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 20rpx;
  background: white;
  border-radius: 20rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);

  &:active {
    background: #f9f9f9;
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.row-image {
  flex-shrink: 0;
  width: 280rpx;
  height: 280rpx;
  border-radius: 16rpx;
  overflow: hidden;
}

.thumb-image {
  width: 100%;
  height: 100%;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #a8e6cf 0%, #88d8b0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-text {
  font-size: 110rpx;
  color: white;
  font-weight: bold;
}

.mini-spinner {
  width: 40rpx;
  height: 40rpx;
  border: 4rpx solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.row-dish-name {
  font-size: 40rpx;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-ingredients {
  font-size: 28rpx;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 8rpx;
}

.row-arrow {
  flex-shrink: 0;
  font-size: 48rpx;
  color: #ccc;
  font-weight: 300;
}

.empty-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #666;
}

.empty-hint {
  font-size: 26rpx;
  color: #999;
  margin-top: 16rpx;
  text-align: center;
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
