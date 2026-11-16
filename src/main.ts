import * as Pinia from 'pinia'
import { createSSRApp } from 'vue'

import App from './App.vue'

export function createApp(): { app: ReturnType<typeof createSSRApp>; Pinia: typeof Pinia } {
  const app = createSSRApp(App)

  app.use(Pinia.createPinia())

  // uniapp 小程序端要求同时返回 Pinia
  return { app, Pinia }
}
