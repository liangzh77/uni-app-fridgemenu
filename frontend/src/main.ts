/**
 * 应用入口文件
 * 初始化Vue应用和Pinia状态管理
 */
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)

  // 创建Pinia实例
  const pinia = createPinia()

  // 添加持久化插件 (仅在支持的环境中)
  // #ifdef MP-WEIXIN || APP-PLUS
  import('pinia-plugin-unistorage').then(({ createUnistorage }) => {
    pinia.use(createUnistorage())
  }).catch(() => {})
  // #endif

  app.use(pinia)

  return {
    app,
    pinia
  }
}
