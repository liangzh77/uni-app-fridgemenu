<template>
  <view class="page-container">
    <RecipeList
      :recipes="recipeList"
      :loading="loading"
      :show-top-bar="true"
      title="我的收藏"
      :show-back="false"
      :show-refresh="true"
      loading-text="加载中..."
      empty-text="还没有收藏"
      empty-hint="快去发现喜欢的菜谱吧"
      :show-retry="false"
      @refresh="loadFavorites"
      @recipe-click="viewDetail"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useUserStore } from '@/stores/user';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Store
const userStore = useUserStore();

// 状态
const favorites = ref([]);
const loading = ref(false);

// 将收藏数据转换为 RecipeList 组件需要的格式
const recipeList = computed(() => {
  return favorites.value.map(item => ({
    id: item.recipe?.id,
    dishName: item.recipe?.dishName,
    imageUrl: item.recipe?.imageUrl,
    ingredients: item.recipe?.ingredientsJson || item.recipe?.ingredients,
    cookingTime: item.recipe?.cookingTime,
    difficulty: item.recipe?.difficulty,
    cuisineType: item.recipe?.cuisineType
  })).filter(r => r.id);
});

// 初始化
onMounted(() => {
  loadFavorites();
});

// 页面显示时刷新
onShow(() => {
  loadFavorites();
});

// 加载收藏列表
const loadFavorites = async () => {
  if (!userStore.isLoggedIn) return;
  if (loading.value) return;

  loading.value = true;

  try {
    const response = await uni.request({
      url: `${API_BASE_URL}/api/favorites`,
      method: 'GET',
      data: {
        userId: userStore.userId,
        page: 1,
        pageSize: 50
      }
    });

    if (response.data.success) {
      favorites.value = response.data.data || [];
    }
  } catch (err) {
    console.error('加载收藏失败:', err);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

// 查看详情
const viewDetail = (recipe) => {
  if (recipe?.id) {
    uni.navigateTo({ url: `/pages/recipe/detail?id=${recipe.id}` });
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
