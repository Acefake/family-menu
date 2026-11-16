/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_UNICLOUD_SPACE_ID?: string
  readonly VITE_UNICLOUD_CLIENT_SECRET?: string
}
