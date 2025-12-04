<template>
  <view class="page-container">
    <!-- 顶部标题 -->
    <view class="page-header">
      <text class="title">AI智能菜谱推荐</text>
      <text class="subtitle">说出你有的食材，智能推荐美味菜谱</text>
    </view>

    <!-- 语音输入区域 -->
    <view class="voice-section">
      <VoiceInput
        @voiceResult="handleVoiceResult"
        @voiceStart="handleVoiceStart"
        @voiceEnd="handleVoiceEnd"
        @voiceError="handleVoiceError"
      />
    </view>

    <!-- 食材列表 -->
    <IngredientList
      :ingredients="ingredientStore.ingredients"
      @delete="handleDeleteIngredient"
      @add="handleAddIngredient"
      @clear="handleClearIngredients"
    />

    <!-- 推荐按钮 -->
    <view class="action-section">
      <button
        class="recommend-btn"
        :class="{ disabled: !canRecommend }"
        :disabled="!canRecommend || isRecommending"
        @click="handleRecommend"
      >
        <text v-if="isRecommending" class="loading-text">推荐中...</text>
        <text v-else>
          {{ ingredientStore.hasIngredients ? '开始推荐菜谱' : '请先添加食材' }}
        </text>
      </button>
    </view>

    <!-- 使用提示 -->
    <view class="tips-section">
      <view class="tip-item">
        <text class="tip-icon">🎤</text>
        <text class="tip-text">长按语音按钮说出食材</text>
      </view>
      <view class="tip-item">
        <text class="tip-icon">✏️</text>
        <text class="tip-text">也可以手动输入食材名称</text>
      </view>
      <view class="tip-item">
        <text class="tip-icon">🍳</text>
        <text class="tip-text">添加完成后点击推荐按钮</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import VoiceInput from '@/components/VoiceInput/VoiceInput.vue';
import IngredientList from '@/components/IngredientList/IngredientList.vue';
import { useUserStore } from '@/stores/user';
import { useIngredientStore } from '@/stores/ingredient';

// Stores
const userStore = useUserStore();
const ingredientStore = useIngredientStore();

// 状态
const isRecommending = ref(false);
const lastClickTime = ref(0);

// 计算属性
const canRecommend = computed(() => {
  return ingredientStore.hasIngredients && !isRecommending.value;
});

// 初始化
onMounted(async () => {
  // 检查登录状态
  if (!userStore.isLoggedIn) {
    try {
      await userStore.wechatLogin();
    } catch (err) {
      console.error('自动登录失败:', err);
    }
  }

  // 加载食材列表
  if (userStore.isLoggedIn) {
    await ingredientStore.loadIngredients();
  }
});

// 处理语音识别结果
const handleVoiceResult = async (text) => {
  console.log('语音识别结果:', text);

  if (!text || !text.trim()) {
    uni.showToast({
      title: '未识别到内容',
      icon: 'none'
    });
    return;
  }

  // 解析食材
  const ingredients = ingredientStore.parseVoiceTextLocal(text);

  if (ingredients.length === 0) {
    uni.showToast({
      title: '未识别到食材',
      icon: 'none'
    });
    return;
  }

  // 显示确认
  uni.showModal({
    title: '识别到以下食材',
    content: ingredients.join('、'),
    confirmText: '添加',
    success: async (res) => {
      if (res.confirm) {
        const result = await ingredientStore.addIngredients(ingredients);
        if (result.success) {
          uni.showToast({
            title: `成功添加${result.created}个食材`,
            icon: 'success'
          });
        } else {
          uni.showToast({
            title: result.message || '添加失败',
            icon: 'none'
          });
        }
      }
    }
  });
};

// 语音录制开始
const handleVoiceStart = () => {
  console.log('开始录音');
};

// 语音录制结束
const handleVoiceEnd = () => {
  console.log('录音结束');
};

// 语音错误
const handleVoiceError = (error) => {
  console.error('语音错误:', error);
  uni.showToast({
    title: '语音识别失败',
    icon: 'none'
  });
};

// 删除食材
const handleDeleteIngredient = async ({ item, index }) => {
  const success = await ingredientStore.deleteIngredient(item.id);
  if (!success) {
    uni.showToast({
      title: '删除失败',
      icon: 'none'
    });
  }
};

// 手动添加食材
const handleAddIngredient = async ({ name }) => {
  const result = await ingredientStore.addIngredients([name]);
  if (result.success && result.created > 0) {
    uni.showToast({
      title: '添加成功',
      icon: 'success'
    });
  } else if (result.skipped > 0) {
    uni.showToast({
      title: '该食材已存在',
      icon: 'none'
    });
  }
};

// 清空食材
const handleClearIngredients = async () => {
  const success = await ingredientStore.clearIngredients();
  if (success) {
    uni.showToast({
      title: '已清空',
      icon: 'success'
    });
  }
};

// 开始推荐（带防抖）
const handleRecommend = () => {
  // 防抖处理 (TASK-028.1)
  const now = Date.now();
  if (now - lastClickTime.value < 1000) {
    return;
  }
  lastClickTime.value = now;

  if (!canRecommend.value) {
    uni.showToast({
      title: '请先添加食材',
      icon: 'none'
    });
    return;
  }

  isRecommending.value = true;

  // 跳转到推荐页面
  uni.navigateTo({
    url: '/pages/recipe/recommend',
    success: () => {
      isRecommending.value = false;
    },
    fail: (err) => {
      console.error('跳转失败:', err);
      isRecommending.value = false;
      uni.showToast({
        title: '跳转失败',
        icon: 'none'
      });
    }
  });
};
</script>

<style lang="scss" scoped>
.page-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0f9f0 0%, #ffffff 30%);
  padding-bottom: 120rpx;
}

.page-header {
  padding: 48rpx 32rpx 32rpx;
  text-align: center;

  .title {
    display: block;
    font-size: 40rpx;
    font-weight: bold;
    color: #333;
  }

  .subtitle {
    display: block;
    font-size: 26rpx;
    color: #999;
    margin-top: 12rpx;
  }
}

.voice-section {
  padding: 32rpx;
  display: flex;
  justify-content: center;
}

.action-section {
  padding: 32rpx;
}

.recommend-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  font-size: 32rpx;
  font-weight: 600;
  border-radius: 48rpx;
  border: none;
  box-shadow: 0 8rpx 24rpx rgba(76, 175, 80, 0.3);

  &.disabled {
    background: #ccc;
    box-shadow: none;
  }

  &:active:not(.disabled) {
    opacity: 0.9;
    transform: scale(0.98);
  }
}

.loading-text {
  display: inline-flex;
  align-items: center;

  &::before {
    content: '';
    width: 32rpx;
    height: 32rpx;
    border: 4rpx solid white;
    border-top-color: transparent;
    border-radius: 50%;
    margin-right: 16rpx;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tips-section {
  padding: 32rpx;
  margin-top: 24rpx;
}

.tip-item {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  color: #666;

  .tip-icon {
    font-size: 32rpx;
    margin-right: 16rpx;
  }

  .tip-text {
    font-size: 26rpx;
  }
}
</style>
