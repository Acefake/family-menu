/**
 * 取得 uniCloud 实例。
 *
 * 通过 HBuilderX 运行且关联了服务空间时，uniCloud 已是可用的默认实例；
 * CLI 项目不一定会被注入服务空间信息，此时用 .env.local 里的配置显式初始化。
 */
let instance: UniCloudNamespace.UniCloud | null = null

export function getCloud(): UniCloudNamespace.UniCloud {
  if (instance) return instance

  const spaceId = import.meta.env.VITE_UNICLOUD_SPACE_ID
  const clientSecret = import.meta.env.VITE_UNICLOUD_CLIENT_SECRET

  if (spaceId && clientSecret) {
    instance = uniCloud.init({ provider: 'aliyun', spaceId, clientSecret })
    return instance
  }
  if ((uniCloud as { _isDefault?: boolean })._isDefault) {
    instance = uniCloud
    return instance
  }
  throw new Error(
    '未连接 uniCloud 服务空间：请复制 .env.example 为 .env.local，填写 VITE_UNICLOUD_SPACE_ID 和 VITE_UNICLOUD_CLIENT_SECRET'
  )
}
