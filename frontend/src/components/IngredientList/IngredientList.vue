<template>
  <view class="ingredient-list-container">
    <!-- 标题区域 -->
    <view class="list-header">
      <text class="title">已添加的食材</text>
      <text class="count">({{ ingredients.length }})</text>
      <view v-if="ingredients.length > 0" class="clear-btn" @click="handleClearAll">
        清空
      </view>
    </view>

    <!-- 食材列表 -->
    <view v-if="ingredients.length > 0" class="ingredient-grid">
      <view
        v-for="(item, index) in ingredients"
        :key="item.id || index"
        class="ingredient-item"
        @longpress="handleLongPress(item, index)"
      >
        <view class="item-content">
          <text class="item-name">{{ item.name }}</text>
          <text v-if="item.category" class="item-category">{{ item.category }}</text>
        </view>
        <view class="delete-btn" @click.stop="handleDelete(item, index)">
          <text class="delete-icon">×</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <image src="/static/icons/empty-box.png" mode="aspectFit" class="empty-icon" />
      <text class="empty-text">还没有添加食材</text>
      <text class="empty-hint">点击上方语音按钮开始添加</text>
    </view>

    <!-- 手动添加区域 -->
    <view class="add-section">
      <view class="input-wrapper">
        <input
          v-model="newIngredient"
          type="text"
          placeholder="手动输入食材名称"
          class="add-input"
          :maxlength="20"
          @confirm="handleManualAdd"
        />
        <view
          class="add-btn"
          :class="{ disabled: !newIngredient.trim() }"
          @click="handleManualAdd"
        >
          添加
        </view>
      </view>
    </view>

    <!-- 删除确认弹窗 -->
    <uni-popup ref="deletePopup" type="dialog">
      <uni-popup-dialog
        type="warn"
        title="删除食材"
        :content="`确定要删除「${selectedItem?.name}」吗？`"
        @confirm="confirmDelete"
        @close="cancelDelete"
      ></uni-popup-dialog>
    </uni-popup>
  </view>
</template>

<script setup>
import { ref } from 'vue';

// Props定义
const props = defineProps({
  ingredients: {
    type: Array,
    default: () => []
  }
});

// Emits定义
const emit = defineEmits(['delete', 'add', 'clear']);

// 状态
const newIngredient = ref('');
const selectedItem = ref(null);
const selectedIndex = ref(-1);
const deletePopup = ref(null);

// 处理删除
const handleDelete = (item, index) => {
  selectedItem.value = item;
  selectedIndex.value = index;

  // 直接删除，不弹窗确认（提升用户体验）
  emit('delete', { item, index });
};

// 长按显示操作菜单
const handleLongPress = (item, index) => {
  uni.showActionSheet({
    itemList: ['删除'],
    success: (res) => {
      if (res.tapIndex === 0) {
        emit('delete', { item, index });
      }
    }
  });
};

// 确认删除
const confirmDelete = () => {
  if (selectedItem.value) {
    emit('delete', {
      item: selectedItem.value,
      index: selectedIndex.value
    });
  }
  cancelDelete();
};

// 取消删除
const cancelDelete = () => {
  selectedItem.value = null;
  selectedIndex.value = -1;
  if (deletePopup.value) {
    deletePopup.value.close();
  }
};

// 手动添加食材
const handleManualAdd = () => {
  const name = newIngredient.value.trim();
  if (!name) {
    uni.showToast({
      title: '请输入食材名称',
      icon: 'none'
    });
    return;
  }

  // 检查是否已存在
  const exists = props.ingredients.some(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    uni.showToast({
      title: '该食材已添加',
      icon: 'none'
    });
    return;
  }

  emit('add', { name });
  newIngredient.value = '';
};

// 清空所有食材
const handleClearAll = () => {
  uni.showModal({
    title: '清空食材',
    content: '确定要清空所有已添加的食材吗？',
    success: (res) => {
      if (res.confirm) {
        emit('clear');
      }
    }
  });
};
</script>

<style lang="scss" scoped>
.ingredient-list-container {
  background: white;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.list-header {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;

  .title {
    font-size: 32rpx;
    font-weight: 600;
    color: #333;
  }

  .count {
    font-size: 28rpx;
    color: #999;
    margin-left: 8rpx;
  }

  .clear-btn {
    margin-left: auto;
    font-size: 26rpx;
    color: #f44336;
    padding: 8rpx 16rpx;
  }
}

.ingredient-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.ingredient-item {
  display: flex;
  align-items: center;
  background: #f5f7fa;
  border-radius: 32rpx;
  padding: 12rpx 16rpx 12rpx 24rpx;
  transition: all 0.2s ease;

  &:active {
    background: #e8eaed;
  }
}

.item-content {
  display: flex;
  flex-direction: column;
}

.item-name {
  font-size: 28rpx;
  color: #333;
}

.item-category {
  font-size: 22rpx;
  color: #999;
  margin-top: 4rpx;
}

.delete-btn {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 12rpx;
  border-radius: 50%;
  background: #ddd;

  &:active {
    background: #ccc;
  }
}

.delete-icon {
  font-size: 28rpx;
  color: #666;
  line-height: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 0;

  .empty-icon {
    width: 160rpx;
    height: 160rpx;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 30rpx;
    color: #999;
    margin-top: 24rpx;
  }

  .empty-hint {
    font-size: 26rpx;
    color: #bbb;
    margin-top: 8rpx;
  }
}

.add-section {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #eee;
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.add-input {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  background: #f5f7fa;
  border-radius: 36rpx;
  font-size: 28rpx;
}

.add-btn {
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
