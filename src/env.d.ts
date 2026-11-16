/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  /** alipay（支付宝云，默认）| aliyun | tencent，要和 uniCloud-<provider> 目录一致 */
  readonly VITE_UNICLOUD_PROVIDER?: string
  readonly VITE_UNICLOUD_SPACE_ID?: string
  readonly VITE_UNICLOUD_CLIENT_SECRET?: string
}
