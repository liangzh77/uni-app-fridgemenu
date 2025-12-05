<template>
  <view class="page-container">
    <!-- 顶部栏 -->
    <view class="top-bar">
      <view class="title">菜谱</view>
      <view class="login-btn" @click="handleLoginClick">
        <text v-if="userStore.isLoggedIn">{{ displayName }}</text>
        <text v-else>登录</text>
      </view>
    </view>

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
import { computed } from 'vue';
import { useRecipeStore } from '@/stores/recipe';
import { useUserStore } from '@/stores/user';

const recipeStore = useRecipeStore();
const userStore = useUserStore();

const displayName = computed(() => {
  if (userStore.userInfo?.username) {
    return userStore.userInfo.username;
  }
  return '已登录';
});

const viewRecipeDetail = (recipe) => {
  uni.navigateTo({
    url: `/pages/recipe/detail?id=${recipe.id}`
  });
};

const handleLoginClick = () => {
  if (userStore.isLoggedIn) {
    // 已登录，可以显示用户菜单或退出登录
    uni.showActionSheet({
      itemList: ['退出登录'],
      success: (res) => {
        if (res.tapIndex === 0) {
          userStore.logout();
          uni.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  } else {
    uni.navigateTo({ url: '/pages/login/index' });
  }
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

.top-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background: white;
  border-bottom: 1px solid #eee;
}

.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.login-btn {
  padding: 12rpx 24rpx;
  background: #f5f5f5;
  border-radius: 32rpx;

  text {
    font-size: 26rpx;
    color: #666;
  }

  &:active {
    background: #e8e8e8;
  }
}
</style>
