/**
 * 应用入口文件
 * 初始化Vue应用和Pinia状态管理
 */
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import { createUnistorage } from 'pinia-plugin-unistorage'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)

  // 创建Pinia实例
  const pinia = createPinia()

  // 添加持久化插件
  pinia.use(createUnistorage())

  app.use(pinia)

  return {
    app,
    pinia
  }
}
