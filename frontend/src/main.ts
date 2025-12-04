/**
 * 应用入口文件
 * 初始化Vue应用和Pinia状态管理
 */
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPersist from 'pinia-plugin-unistorage'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)

  // 创建Pinia实例并添加持久化插件
  const pinia = createPinia()
  pinia.use(piniaPersist)

  app.use(pinia)

  return {
    app,
    pinia
  }
}
