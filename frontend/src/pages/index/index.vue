<template>
  <view class="page-container">
    <!-- 食材列表 - 填充顶部剩余空间 -->
    <view class="ingredient-section">
      <IngredientList
        :ingredients="ingredientStore.ingredients"
        @delete="handleDeleteIngredient"
      />
    </view>

    <!-- 底部固定区域 -->
    <view class="bottom-input-section">
      <!-- 清空按钮 -->
      <view v-if="ingredientStore.hasIngredients" class="clear-row">
        <view class="clear-btn" @click="handleClearIngredients">清空</view>
      </view>
      <!-- 语音输入 -->
      <view class="voice-row">
        <VoiceInput
          @voiceResult="handleVoiceResult"
          @voiceStart="handleVoiceStart"
          @voiceEnd="handleVoiceEnd"
          @voiceError="handleVoiceError"
        />
      </view>
      <!-- 手动输入 -->
      <view class="manual-row">
        <input
          v-model="manualIngredient"
          type="text"
          placeholder="手动输入食材名称"
          class="manual-input"
          :maxlength="20"
          @confirm="handleManualInputAdd"
        />
        <view
          class="manual-add-btn"
          :class="{ disabled: !manualIngredient.trim() }"
          @click="handleManualInputAdd"
        >
          添加
        </view>
      </view>
    </view>

  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
// 组件通过 easycom 自动导入，无需手动 import
import { useUserStore } from '@/stores/user';
import { useIngredientStore } from '@/stores/ingredient';

// Stores
const userStore = useUserStore();
const ingredientStore = useIngredientStore();

// 状态
const manualIngredient = ref('');

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

// 手动输入添加食材
const handleManualInputAdd = async () => {
  const name = manualIngredient.value.trim();
  if (!name) {
    uni.showToast({
      title: '请输入食材名称',
      icon: 'none'
    });
    return;
  }

  const result = await ingredientStore.addIngredients([name]);
  if (result.success && result.created > 0) {
    uni.showToast({
      title: '添加成功',
      icon: 'success'
    });
    manualIngredient.value = '';
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
</script>

<style lang="scss" scoped>
.page-container {
  height: 100vh;
  background: linear-gradient(180deg, #f0f9f0 0%, #ffffff 30%);
}

// 食材区域 - 固定在顶部到清空按钮上方
.ingredient-section {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 530rpx; // 清空+语音+手动输入+tabBar的高度
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

// 底部固定输入区域
.bottom-input-section {
  position: fixed;
  bottom: 100rpx; // tabBar 高度
  left: 0;
  right: 0;
}

// 清空按钮行
.clear-row {
  display: flex;
  justify-content: center;
  padding: 16rpx 32rpx;
}

.clear-btn {
  padding: 12rpx 48rpx;
  background: #ffebee;
  border-radius: 32rpx;
  color: #f44336;
  font-size: 28rpx;

  &:active {
    background: #ffcdd2;
  }
}

// 语音输入行 - 无背景
.voice-row {
  display: flex;
  justify-content: center;
  padding: 16rpx 32rpx;
}

// 手动输入行
.manual-row {
  display: flex;
  align-items: center;
  padding: 16rpx 32rpx;
  gap: 16rpx;
  background: white;
}

.manual-input {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  background: #f5f7fa;
  border-radius: 36rpx;
  font-size: 28rpx;
}

.manual-add-btn {
  padding: 0 32rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border-radius: 36rpx;
  font-size: 28rpx;
  font-weight: 500;

  &.disabled {
    background: #ccc;
    color: #999;
  }

  &:active:not(.disabled) {
    opacity: 0.8;
  }
}
</style>
