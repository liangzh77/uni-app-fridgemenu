<template>
  <view class="page-container">
    <!-- 食材输入区域 -->
    <view v-if="!showRecommendations" class="input-section">
      <!-- 食材区域 - 顶部 -->
      <view class="ingredient-section">
        <IngredientList
          :ingredients="ingredientStore.ingredients"
          @delete="handleDeleteIngredient"
        />
      </view>

      <!-- 语音输入区域（含两侧圆形按钮） -->
      <view class="voice-row">
        <!-- 左侧清空按钮 -->
        <view
          v-if="ingredientStore.hasIngredients"
          class="side-btn clear-btn"
          @click="handleClearIngredients"
        >
          清空
        </view>
        <view v-else class="side-btn-placeholder"></view>

        <!-- 中间语音按钮 -->
        <VoiceInput
          @voiceResult="handleVoiceResult"
          @voiceStart="handleVoiceStart"
          @voiceEnd="handleVoiceEnd"
          @voiceError="handleVoiceError"
        />

        <!-- 右侧发现按钮 -->
        <view
          v-if="ingredientStore.hasIngredients"
          class="side-btn recipe-btn"
          @click="handleDiscoverRecipes"
        >
          发现
        </view>
        <view v-else class="side-btn-placeholder"></view>
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

    <!-- 菜谱推荐区域 - 使用通用组件 -->
    <RecipeList
      v-else
      :recipes="recipeStore.recommendations"
      :loading="recipeStore.loading"
      :ingredient-names="ingredientStore.ingredientNames"
      :show-back="true"
      :show-refresh="true"
      loading-text="AI正在为您推荐菜谱..."
      empty-text="未能获取推荐"
      :empty-hint="recipeStore.error || '请返回添加食材后重试'"
      @back="handleBackToInput"
      @refresh="handleRefreshRecipes"
      @retry="loadRecommendations"
      @recipe-click="viewRecipeDetail"
    />
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
// 组件通过 easycom 自动导入，无需手动 import
import { useUserStore } from '@/stores/user';
import { useIngredientStore } from '@/stores/ingredient';
import { useRecipeStore } from '@/stores/recipe';

// Stores
const userStore = useUserStore();
const ingredientStore = useIngredientStore();
const recipeStore = useRecipeStore();

// 状态
const manualIngredient = ref('');
const showRecommendations = ref(false);
const imagePollingTimer = ref(null);

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

  // 检查登录状态
  if (!userStore.isLoggedIn) {
    try {
      await userStore.wechatLogin();
    } catch (err) {
      uni.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
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
  } else {
    uni.showToast({
      title: result.message || '添加失败',
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

// 点击"发现"按钮，在首页显示推荐
const handleDiscoverRecipes = async () => {
  // 如果食材正在加载中，等待完成
  if (ingredientStore.loading) {
    uni.showToast({
      title: '请稍候...',
      icon: 'loading'
    });
    return;
  }

  // 如果输入框有未添加的食材，先添加它
  const pendingIngredient = manualIngredient.value.trim();
  if (pendingIngredient) {
    const result = await ingredientStore.addIngredients([pendingIngredient]);
    if (result.success && result.created > 0) {
      manualIngredient.value = '';
    }
  }

  // 清空旧推荐，确保每次点击都重新获取
  recipeStore.clearRecommendations();
  showRecommendations.value = true;
  await loadRecommendations();
  startImagePolling();
};

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

// 换一批
const handleRefreshRecipes = async () => {
  const result = await recipeStore.refreshRecommendations();
  if (result.success) {
    uni.showToast({
      title: '已为您换一批推荐',
      icon: 'success'
    });
    startImagePolling();
  } else {
    uni.showToast({
      title: result.message || '刷新失败',
      icon: 'none'
    });
  }
};

// 返回食材输入界面
const handleBackToInput = () => {
  showRecommendations.value = false;
  stopImagePolling();
};

// 查看菜谱详情
const viewRecipeDetail = (recipe) => {
  uni.navigateTo({
    url: `/pages/recipe/detail?id=${recipe.id}`
  });
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

    for (const recipe of pendingRecipes) {
      const status = statusMap[recipe.imageId];
      if (status?.ready && status.imageUrl) {
        recipeStore.updateImageUrl(recipe.id, status.imageUrl);
      }
    }
  }, 3000);
};

const stopImagePolling = () => {
  if (imagePollingTimer.value) {
    clearInterval(imagePollingTimer.value);
    imagePollingTimer.value = null;
  }
};

// 清理
onUnmounted(() => {
  stopImagePolling();
});
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f0f9f0 0%, #ffffff 30%);
  overflow: hidden;
  box-sizing: border-box;

  /* #ifdef H5 */
  height: calc(100vh - 44px);
  padding-bottom: 60px;
  /* #endif */

  /* #ifdef MP-WEIXIN */
  height: 100%;
  /* #endif */
}

// 食材输入区域
.input-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// 食材区域 - 占据剩余空间
.ingredient-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}

// 语音输入行（含两侧圆形按钮）
.voice-row {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24rpx 32rpx;
  gap: 60rpx;
}

// 两侧圆形按钮通用样式
.side-btn {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 500;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.side-btn-placeholder {
  width: 140rpx;
  height: 140rpx;
  flex-shrink: 0;
}

.clear-btn {
  background: #ffebee;
  color: #f44336;

  &:active {
    background: #ffcdd2;
    transform: scale(0.95);
  }
}

.recipe-btn {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;

  &:active {
    opacity: 0.8;
    transform: scale(0.95);
  }
}

// 手动输入行
.manual-row {
  flex-shrink: 0;
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
