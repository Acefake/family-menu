import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { type Ref, ref } from 'vue'

import { errorMessage } from '@/api/menu'
import { useSessionStore } from '@/stores/session'

export interface UsePageDataReturn {
  loading: Ref<boolean>
  error: Ref<string>
  /** 已登录但还没加入家庭 */
  noFamily: Ref<boolean>
  reload: () => Promise<void>
}

/** 页面每次显示时：确保已登录、已有家庭，再执行 load */
export function usePageData(load: () => Promise<void>): UsePageDataReturn {
  const session = useSessionStore()
  const { family } = storeToRefs(session)
  const loading = ref(true)
  const error = ref('')
  const noFamily = ref(false)

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

  return { loading, error, noFamily, reload }
}
