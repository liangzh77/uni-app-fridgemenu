<template>
  <view class="page-container">
    <RecipeList
      :recipes="recipeStore.recommendations"
      :loading="recipeStore.loading"
      :ingredient-names="ingredientStore.ingredientNames"
      :show-back="false"
      :show-refresh="true"
      loading-text="AI正在为您推荐菜谱..."
      empty-text="未能获取推荐"
      :empty-hint="recipeStore.error || '请先在首页添加食材'"
      @refresh="handleRefresh"
      @retry="loadRecommendations"
      @recipe-click="viewDetail"
    />
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useRecipeStore } from '@/stores/recipe';
import { useIngredientStore } from '@/stores/ingredient';

// Stores
const recipeStore = useRecipeStore();
const ingredientStore = useIngredientStore();

// 状态
const imagePollingTimer = ref(null);
const lastRefreshTime = ref(0);

// 初始化
onMounted(async () => {
  await loadRecommendations();
  startImagePolling();
});

// 页面显示时检查是否需要刷新
onShow(async () => {
  if (recipeStore.consumeNeedRefresh()) {
    await loadRecommendations();
    startImagePolling();
  }
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
  const now = Date.now();
  if (now - lastRefreshTime.value < 2000) {
    uni.showToast({ title: '请稍候再试', icon: 'none' });
    return;
  }
  lastRefreshTime.value = now;

  const result = await recipeStore.refreshRecommendations();
  if (result.success) {
    uni.showToast({ title: '已为您换一批推荐', icon: 'success' });
    startImagePolling();
  } else {
    uni.showToast({ title: result.message || '刷新失败', icon: 'none' });
  }
};

// 查看详情
const viewDetail = (recipe) => {
  uni.navigateTo({ url: `/pages/recipe/detail?id=${recipe.id}` });
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
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f7fa;
}
</style>
