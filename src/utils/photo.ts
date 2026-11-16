import { type Ref, ref, watch } from 'vue'

const CLOUD_PREFIX = 'cloud://'
/** 临时链接会过期，留出余量后重新换 */
const TTL_MS = 30 * 60 * 1000

const cache = new Map<string, { url: string; expires: number }>()
const pending = new Map<string, Promise<string>>()

/**
 * 小程序的 <image> 不认 uniCloud 的 cloud:// 文件 ID，要先换成临时的 https 链接。
 * 普通路径（/static、本地临时文件）原样返回；同一张图并发请求只换一次。
 */
export function resolvePhoto(src: string): Promise<string> {
  if (!src.startsWith(CLOUD_PREFIX)) return Promise.resolve(src)
  const hit = cache.get(src)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url)
  const inflight = pending.get(src)
  if (inflight) return inflight

  const task = uniCloud
    .getTempFileURL({ fileList: [src] })
    .then((res: { fileList?: { tempFileURL?: string }[] }) => {
      const url = res.fileList?.[0]?.tempFileURL ?? ''
      if (url) cache.set(src, { url, expires: Date.now() + TTL_MS })
      return url
    })
    .finally(() => pending.delete(src))
  pending.set(src, task)
  return task
}

/** 在组件里用：传入会变的图片地址，返回能直接给 <image> 的链接，换好之前是空串 */
export function usePhotoUrl(source: () => string): Ref<string> {
  const url = ref('')
  watch(
    source,
    async (src) => {
      url.value = ''
      if (!src) return
      try {
        url.value = await resolvePhoto(src)
      } catch {
        url.value = ''
      }
    },
    { immediate: true }
  )
  return url
}
