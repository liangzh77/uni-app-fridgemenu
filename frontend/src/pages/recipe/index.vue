<template>
  <view class="page-container">
    <RecipeList
      :recipes="recipeStore.historyRecipes"
      :loading="false"
      :show-top-bar="false"
      :show-back="false"
      :show-refresh="false"
      loading-text="加载中..."
      empty-text="暂无菜谱"
      empty-hint="去首页发现美味菜谱吧"
      :show-retry="false"
      @recipe-click="viewRecipeDetail"
    />
  </view>
</template>

<script setup>
import { useRecipeStore } from '@/stores/recipe';

const recipeStore = useRecipeStore();

const viewRecipeDetail = (recipe) => {
  uni.navigateTo({
    url: `/pages/recipe/detail?id=${recipe.id}`
  });
};
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;

  /* #ifdef H5 */
  height: calc(100vh - 44px);
  padding-bottom: 60px;
  /* #endif */
}
</style>
