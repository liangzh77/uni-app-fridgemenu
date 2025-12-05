<script setup lang="ts">
/**
 * 根组件
 * 应用启动时的初始化逻辑
 */
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'

onLaunch(() => {
  console.log('App Launch')
  // 检查微信登录状态
  checkLoginStatus()
})

onShow(() => {
  console.log('App Show')
})

onHide(() => {
  console.log('App Hide')
})

/**
 * 检查用户登录状态
 * 如果未登录则尝试静默登录获取openid
 */
function checkLoginStatus() {
  // #ifdef MP-WEIXIN
  uni.checkSession({
    success: () => {
      console.log('Session有效')
    },
    fail: () => {
      // session过期，需要重新登录
      silentLogin()
    }
  })
  // #endif
}

/**
 * 静默登录获取openid
 */
function silentLogin() {
  // #ifdef MP-WEIXIN
  uni.login({
    success: (res) => {
      if (res.code) {
        // 发送code到后端换取openid
        console.log('登录code:', res.code)
        // TODO: 调用后端API获取openid
      }
    },
    fail: (err) => {
      console.error('登录失败:', err)
    }
  })
  // #endif
}
</script>

<style>
/* 全局样式 */
page {
  background-color: #f8f8f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  height: 100%;
  overflow: hidden;
}

html, body, #app {
  height: 100%;
  overflow: hidden;
}

/* 主题色变量 */
:root {
  --primary-color: #ff6b35;
  --primary-light: #ff8c5a;
  --primary-dark: #e55a2b;
  --text-primary: #333333;
  --text-secondary: #666666;
  --text-hint: #999999;
  --border-color: #eeeeee;
  --background-color: #f8f8f8;
  --card-background: #ffffff;
}

/* 通用工具类 */
.flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* H5 tabBar 样式优化 */
.uni-tabbar {
  height: 70px !important;
}

.uni-tabbar .uni-tabbar__item {
  height: 70px !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
}

.uni-tabbar .uni-tabbar__label {
  font-size: 18px !important;
  margin-top: 4px !important;
}

.uni-tabbar .uni-tabbar__icon {
  width: 30px !important;
  height: 30px !important;
}
</style>
