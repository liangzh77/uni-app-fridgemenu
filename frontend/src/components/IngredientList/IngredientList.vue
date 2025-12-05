<template>
  <view class="ingredient-list-container">
    <!-- 食材列表 -->
    <view v-if="ingredients.length > 0" class="ingredient-grid">
      <view
        v-for="(item, index) in ingredients"
        :key="item.id || index"
        class="ingredient-row"
        @longpress="handleLongPress(item, index)"
      >
        <view class="ingredient-item">
          <text class="item-name">{{ item.name }}</text>
        </view>
        <view class="delete-btn" @click.stop="handleDelete(item, index)">
          <text class="delete-icon">×</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <text class="empty-text">说出你的食材</text>
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
const emit = defineEmits(['delete']);

// 状态
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

</script>

<style lang="scss" scoped>
.ingredient-list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; // 重要：让flex子元素可以收缩
}

.ingredient-grid {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 32rpx;
  min-height: 0;
}

.ingredient-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.ingredient-item {
  display: flex;
  align-items: center;
  background: rgba(76, 175, 80, 0.15);
  border: 2rpx solid rgba(76, 175, 80, 0.3);
  border-radius: 48rpx;
  padding: 20rpx 36rpx;
  transition: all 0.2s ease;

  &:active {
    background: rgba(76, 175, 80, 0.25);
  }
}

.item-name {
  font-size: 36rpx;
  color: #2e7d32;
  font-weight: 500;
}

.delete-btn {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(200, 200, 200, 0.5);

  &:active {
    background: rgba(200, 200, 200, 0.8);
  }
}

.delete-icon {
  font-size: 36rpx;
  color: #666;
  line-height: 1;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;

  .empty-text {
    font-size: 36rpx;
    color: #bbb;
  }
}
</style>
