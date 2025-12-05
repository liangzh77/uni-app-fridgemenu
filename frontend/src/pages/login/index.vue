<template>
  <view class="login-container">
    <!-- Logo -->
    <view class="logo-section">
      <image src="/static/icons/logo.png" mode="aspectFit" class="logo" />
      <text class="app-name">冰箱菜单</text>
      <text class="app-slogan">智能食谱推荐</text>
    </view>

    <!-- 表单 -->
    <view class="form-section">
      <!-- Tab切换 -->
      <view class="tabs">
        <view
          class="tab-item"
          :class="{ active: activeTab === 'login' }"
          @click="activeTab = 'login'"
        >
          登录
        </view>
        <view
          class="tab-item"
          :class="{ active: activeTab === 'register' }"
          @click="activeTab = 'register'"
        >
          注册
        </view>
      </view>

      <!-- 用户名 -->
      <view class="input-group">
        <view class="input-icon">
          <text>👤</text>
        </view>
        <input
          v-model="username"
          type="text"
          placeholder="请输入用户名"
          class="input-field"
          :maxlength="20"
        />
      </view>

      <!-- 密码 -->
      <view class="input-group">
        <view class="input-icon">
          <text>🔒</text>
        </view>
        <input
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="请输入密码"
          class="input-field"
          :maxlength="20"
        />
        <view class="input-suffix" @click="showPassword = !showPassword">
          <text>{{ showPassword ? '🙈' : '👁️' }}</text>
        </view>
      </view>

      <!-- 确认密码（仅注册时显示） -->
      <view v-if="activeTab === 'register'" class="input-group">
        <view class="input-icon">
          <text>🔒</text>
        </view>
        <input
          v-model="confirmPassword"
          :type="showPassword ? 'text' : 'password'"
          placeholder="请确认密码"
          class="input-field"
          :maxlength="20"
        />
      </view>

      <!-- 提交按钮 -->
      <button
        class="submit-btn"
        :disabled="loading"
        @click="handleSubmit"
      >
        {{ loading ? '处理中...' : (activeTab === 'login' ? '登录' : '注册') }}
      </button>

      <!-- 错误提示 -->
      <view v-if="errorMsg" class="error-msg">
        <text>{{ errorMsg }}</text>
      </view>
    </view>

    <!-- 返回按钮 -->
    <view class="back-btn" @click="goBack">
      <text>返回</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

// 状态
const activeTab = ref('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const loading = ref(false);
const errorMsg = ref('');

// 表单验证
const validate = () => {
  errorMsg.value = '';

  if (!username.value.trim()) {
    errorMsg.value = '请输入用户名';
    return false;
  }

  if (username.value.length < 3) {
    errorMsg.value = '用户名至少3个字符';
    return false;
  }

  if (!password.value) {
    errorMsg.value = '请输入密码';
    return false;
  }

  if (password.value.length < 6) {
    errorMsg.value = '密码至少6个字符';
    return false;
  }

  if (activeTab.value === 'register') {
    if (password.value !== confirmPassword.value) {
      errorMsg.value = '两次密码不一致';
      return false;
    }
  }

  return true;
};

// 提交
const handleSubmit = async () => {
  if (!validate()) return;

  loading.value = true;
  errorMsg.value = '';

  try {
    let result;
    if (activeTab.value === 'login') {
      result = await userStore.login(username.value, password.value);
    } else {
      result = await userStore.register(username.value, password.value);
    }

    if (result.success) {
      uni.showToast({
        title: activeTab.value === 'login' ? '登录成功' : '注册成功',
        icon: 'success'
      });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else {
      errorMsg.value = result.message || '操作失败';
    }
  } catch (err) {
    console.error('登录/注册失败:', err);
    errorMsg.value = '网络错误，请重试';
  } finally {
    loading.value = false;
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};
</script>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0f9f0 0%, #ffffff 50%);
  padding: 80rpx 48rpx;
  box-sizing: border-box;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 80rpx;

  .logo {
    width: 160rpx;
    height: 160rpx;
    margin-bottom: 24rpx;
  }

  .app-name {
    font-size: 48rpx;
    font-weight: bold;
    color: #2e7d32;
    margin-bottom: 12rpx;
  }

  .app-slogan {
    font-size: 28rpx;
    color: #666;
  }
}

.form-section {
  background: white;
  border-radius: 24rpx;
  padding: 48rpx 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.08);
}

.tabs {
  display: flex;
  margin-bottom: 48rpx;
  border-bottom: 2rpx solid #eee;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 24rpx 0;
  font-size: 32rpx;
  color: #999;
  position: relative;

  &.active {
    color: #4CAF50;
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      bottom: -2rpx;
      left: 50%;
      transform: translateX(-50%);
      width: 80rpx;
      height: 4rpx;
      background: #4CAF50;
      border-radius: 2rpx;
    }
  }
}

.input-group {
  display: flex;
  align-items: center;
  background: #f5f7fa;
  border-radius: 16rpx;
  padding: 0 24rpx;
  margin-bottom: 24rpx;
  height: 96rpx;

  .input-icon {
    width: 48rpx;
    font-size: 32rpx;
  }

  .input-field {
    flex: 1;
    height: 100%;
    font-size: 30rpx;
    color: #333;
  }

  .input-suffix {
    width: 48rpx;
    font-size: 28rpx;
    text-align: right;
  }
}

.submit-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  font-size: 32rpx;
  font-weight: 600;
  border-radius: 48rpx;
  border: none;
  margin-top: 32rpx;

  &:disabled {
    background: #ccc;
  }

  &:active:not(:disabled) {
    opacity: 0.9;
  }
}

.error-msg {
  margin-top: 24rpx;
  text-align: center;

  text {
    color: #f44336;
    font-size: 26rpx;
  }
}

.back-btn {
  position: fixed;
  top: 32rpx;
  left: 32rpx;
  padding: 16rpx 32rpx;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 32rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);

  text {
    color: #666;
    font-size: 28rpx;
  }
}
</style>
