<template>
  <view class="recipe-card" @click="handleClick">
    <!-- 图片区域 -->
    <view class="card-image">
      <!-- 加载成功 -->
      <image
        v-if="imageUrl && imageLoaded"
        :src="imageUrl"
        mode="aspectFill"
        class="recipe-image"
        :lazy-load="true"
        @load="onImageLoad"
        @error="onImageError"
      />

      <!-- 加载中/骨架屏 -->
      <view v-else-if="imagePending || !imageLoaded" class="image-skeleton">
        <view class="skeleton-animation"></view>
        <view v-if="imagePending" class="loading-indicator">
          <view class="mini-spinner"></view>
          <text class="loading-text">图片生成中</text>
        </view>
      </view>

      <!-- 占位符（无图片） -->
      <view v-else class="image-placeholder">
        <text class="placeholder-text">{{ dishName?.charAt(0) || '菜' }}</text>
      </view>

      <!-- 难度标签 -->
      <view class="difficulty-badge" :class="difficulty">
        {{ difficultyText }}
      </view>
    </view>

    <!-- 信息区域 -->
    <view class="card-content">
      <text class="dish-name">{{ dishName }}</text>

      <view class="meta-row">
        <view class="meta-item">
          <text class="meta-icon">⏱️</text>
          <text class="meta-value">{{ cookingTime || '—' }}分钟</text>
        </view>
        <view class="meta-item">
          <text class="meta-icon">🍽️</text>
          <text class="meta-value">{{ cuisineType || '家常菜' }}</text>
        </view>
      </view>

      <!-- 主要食材 -->
      <view class="ingredient-preview">
        <text
          v-for="(ing, index) in displayIngredients"
          :key="index"
          class="ingredient-tag"
        >
          {{ ing.name || ing }}
        </text>
        <text v-if="ingredients?.length > 3" class="more-count">
          +{{ ingredients.length - 3 }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

// Props
const props = defineProps({
  id: {
    type: [Number, String],
    required: true
  },
  dishName: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  imagePending: {
    type: Boolean,
    default: false
  },
  cookingTime: {
    type: Number,
    default: null
  },
  difficulty: {
    type: String,
    default: 'medium',
    validator: (v) => ['easy', 'medium', 'hard'].includes(v)
  },
  cuisineType: {
    type: String,
    default: ''
  },
  ingredients: {
    type: Array,
    default: () => []
  }
});

// Emits
const emit = defineEmits(['click']);

// 状态
const imageLoaded = ref(false);
const imageError = ref(false);

// 计算属性
const difficultyText = computed(() => {
  const map = {
    easy: '简单',
    medium: '适中',
    hard: '复杂'
  };
  return map[props.difficulty] || '适中';
});

const displayIngredients = computed(() => {
  return props.ingredients?.slice(0, 3) || [];
});

// 监听图片URL变化
watch(() => props.imageUrl, (newUrl) => {
  if (newUrl) {
    imageLoaded.value = false;
    imageError.value = false;
  }
});

// 方法
const handleClick = () => {
  emit('click', {
    id: props.id,
    dishName: props.dishName
  });
};

const onImageLoad = () => {
  imageLoaded.value = true;
  imageError.value = false;
};

const onImageError = () => {
  imageLoaded.value = false;
  imageError.value = true;
};
</script>

<style lang="scss" scoped>
.recipe-card {
  background: white;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  transition: transform 0.2s, box-shadow 0.2s;

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  }
}

.card-image {
  position: relative;
  width: 100%;
  height: 280rpx;
  overflow: hidden;
}

.recipe-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-skeleton {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skeleton-animation {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent
  );
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  100% {
    left: 100%;
  }
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
}

.mini-spinner {
  width: 40rpx;
  height: 40rpx;
  border: 4rpx solid rgba(0, 0, 0, 0.1);
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 22rpx;
  color: #999;
  margin-top: 12rpx;
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
  font-size: 100rpx;
  color: white;
  font-weight: bold;
  text-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.1);
}

.difficulty-badge {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  font-weight: 500;

  &.easy {
    background: rgba(76, 175, 80, 0.9);
    color: white;
  }

  &.medium {
    background: rgba(255, 152, 0, 0.9);
    color: white;
  }

  &.hard {
    background: rgba(244, 67, 54, 0.9);
    color: white;
  }
}

.card-content {
  padding: 20rpx 24rpx 24rpx;
}

.dish-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  display: block;
  margin-bottom: 12rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
}

.meta-icon {
  margin-right: 6rpx;
}

.meta-value {
  color: #666;
}

.ingredient-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.ingredient-tag {
  padding: 6rpx 14rpx;
  background: #f5f7fa;
  border-radius: 16rpx;
  font-size: 22rpx;
  color: #666;
}

.more-count {
  padding: 6rpx 14rpx;
  background: #e8f5e9;
  border-radius: 16rpx;
  font-size: 22rpx;
  color: #4CAF50;
}
</style>
