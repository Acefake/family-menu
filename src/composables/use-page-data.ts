import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { type Ref, ref } from 'vue'

import { errorMessage } from '@/api/menu'
import { useSessionStore } from '@/stores/session'

export interface UsePageDataReturn {
  loading: Ref<boolean>
  error: Ref<string>
  /** 已登录但还没加入家庭 */
  noFamily: Ref<boolean>
  /** 正在下拉刷新（微信自带的下拉动画松手就收回，页面上用这个状态显示「正在刷新」） */
  refreshing: Ref<boolean>
  reload: () => Promise<void>
}

/** 页面每次显示时：确保已登录、已有家庭，再执行 load */
export function usePageData(load: () => Promise<void>): UsePageDataReturn {
  const session = useSessionStore()
  const { family } = storeToRefs(session)
  const loading = ref(true)
  const error = ref('')
  const noFamily = ref(false)
  const refreshing = ref(false)

  async function reload(): Promise<void> {
    error.value = ''
    try {
      await session.ensureReady()
      noFamily.value = !family.value
      if (!noFamily.value) await load()
    } catch (err) {
      error.value = errorMessage(err)
    } finally {
      loading.value = false
    }
  }

  onShow(reload)

  // 只有在 pages.json 里开了 enablePullDownRefresh 的页面才会触发
  onPullDownRefresh(async () => {
    uni.stopPullDownRefresh()
    if (refreshing.value) return
    refreshing.value = true
    try {
      // 家庭成员、分类这些放在登录态里，一起刷新
      await session
        .ensureReady()
        .then(() => session.refreshFamily())
        .catch(() => undefined)
      await reload()
    } finally {
      refreshing.value = false
    }
  })

  return { loading, error, noFamily, refreshing, reload }
}
