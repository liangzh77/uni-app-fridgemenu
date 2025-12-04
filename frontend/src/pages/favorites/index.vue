<template>
  <view class="page-container">
    <!-- 标题 -->
    <view class="page-header">
      <text class="title">我的收藏</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading && favorites.length === 0" class="loading-container">
      <view class="loading-spinner"></view>
      <text>加载中...</text>
    </view>

    <!-- 收藏列表 -->
    <view v-else-if="favorites.length > 0" class="favorites-list">
      <view
        v-for="item in favorites"
        :key="item.id"
        class="favorite-card"
        @click="viewDetail(item.recipe)"
      >
        <!-- 图片 -->
        <view class="card-image">
          <image
            v-if="item.recipe?.imageUrl"
            :src="item.recipe.imageUrl"
            mode="aspectFill"
            class="recipe-image"
          />
          <view v-else class="image-placeholder">
            <text class="placeholder-text">{{ item.recipe?.dishName?.charAt(0) }}</text>
          </view>
        </view>

        <!-- 信息 -->
        <view class="card-info">
          <text class="dish-name">{{ item.recipe?.dishName }}</text>
          <view class="meta-row">
            <text class="meta-item">{{ item.recipe?.cookingTime || '—' }}分钟</text>
            <text class="meta-divider">|</text>
            <text class="meta-item">{{ item.recipe?.cuisineType || '家常菜' }}</text>
          </view>
          <text class="favorite-time">
            收藏于 {{ formatDate(item.favoritedAt) }}
          </text>
        </view>

        <!-- 删除按钮 -->
        <view class="delete-btn" @click.stop="removeFavorite(item)">
          <text class="delete-icon">×</text>
        </view>
      </view>

      <!-- 加载更多 -->
      <view v-if="hasMore" class="load-more" @click="loadMore">
        <text>{{ loading ? '加载中...' : '加载更多' }}</text>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-container">
      <image src="/static/icons/empty-favorite.png" mode="aspectFit" class="empty-icon" />
      <text class="empty-text">还没有收藏</text>
      <text class="empty-hint">快去发现喜欢的菜谱吧</text>
      <button class="discover-btn" @click="goDiscover">去发现</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Store
const userStore = useUserStore();

// 状态
const favorites = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const hasMore = ref(false);

// 初始化
onMounted(() => {
  loadFavorites();
});

// 加载收藏列表
const loadFavorites = async (append = false) => {
  if (!userStore.isLoggedIn) {
    return;
  }

  if (loading.value) return;
  loading.value = true;

  try {
    const response = await uni.request({
      url: `${API_BASE_URL}/api/favorites`,
      method: 'GET',
      data: {
        userId: userStore.userId,
        page: page.value,
        pageSize: pageSize.value
      }
    });

    if (response.data.success) {
      if (append) {
        favorites.value = [...favorites.value, ...response.data.data];
      } else {
        favorites.value = response.data.data;
      }

      total.value = response.data.pagination.total;
      hasMore.value = favorites.value.length < total.value;
    }
  } catch (err) {
    console.error('加载收藏失败:', err);
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    });
  } finally {
    loading.value = false;
  }
};

// 加载更多
const loadMore = () => {
  if (hasMore.value && !loading.value) {
    page.value++;
    loadFavorites(true);
  }
};

// 移除收藏
const removeFavorite = async (item) => {
  uni.showModal({
    title: '取消收藏',
    content: `确定要取消收藏「${item.recipe?.dishName}」吗？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          const response = await uni.request({
            url: `${API_BASE_URL}/api/favorites/${item.recipeId}`,
            method: 'DELETE',
            data: { userId: userStore.userId }
          });

          if (response.data.success) {
            favorites.value = favorites.value.filter(f => f.id !== item.id);
            total.value--;

            uni.showToast({
              title: '已取消收藏',
              icon: 'success'
            });
          }
        } catch (err) {
          console.error('取消收藏失败:', err);
          uni.showToast({
            title: '操作失败',
            icon: 'none'
          });
        }
      }
    }
  });
};

// 查看详情
const viewDetail = (recipe) => {
  if (recipe?.id) {
    uni.navigateTo({
      url: `/pages/recipe/detail?id=${recipe.id}`
    });
  }
};

// 去发现
const goDiscover = () => {
  uni.switchTab({
    url: '/pages/index/index'
  });
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
};
</script>

<style lang="scss" scoped>
.page-container {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 120rpx;
}

.page-header {
  padding: 48rpx 32rpx 24rpx;
  background: white;

  .title {
    font-size: 36rpx;
    font-weight: bold;
    color: #333;
  }
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx;
  color: #999;
}

.loading-spinner {
  width: 60rpx;
  height: 60rpx;
  border: 4rpx solid #ddd;
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 24rpx;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.favorites-list {
  padding: 24rpx;
}

.favorite-card {
  display: flex;
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
  width: 200rpx;
  height: 200rpx;
  flex-shrink: 0;
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
  font-size: 64rpx;
  color: white;
  font-weight: bold;
}

.card-info {
  flex: 1;
  padding: 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.dish-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 12rpx;
}

.meta-row {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}

.meta-item {
  font-size: 24rpx;
  color: #666;
}

.meta-divider {
  margin: 0 12rpx;
  color: #ddd;
}

.favorite-time {
  font-size: 22rpx;
  color: #999;
}

.delete-btn {
  width: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.delete-icon {
  font-size: 40rpx;
  color: #999;
}

.load-more {
  text-align: center;
  padding: 24rpx;
  color: #999;
  font-size: 26rpx;
}

.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 64rpx;
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
  margin-top: 12rpx;
}

.discover-btn {
  margin-top: 32rpx;
  padding: 0 64rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border-radius: 40rpx;
  font-size: 28rpx;
}
</style>
