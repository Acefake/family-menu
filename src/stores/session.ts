import { defineStore } from 'pinia'
import { ref } from 'vue'

import { menuCo } from '@/api/menu'
import type { Family, Meal } from '@/types/models'
import { currentMeal, today } from '@/utils/date'

const TOKEN_KEY = 'uni_id_token'
const TOKEN_EXPIRED_KEY = 'uni_id_token_expired'

/** 登录态、当前家庭和正在看的那一顿 */
export const useSessionStore = defineStore('session', () => {
  const uid = ref('')
  const family = ref<Family | null>(null)
  const date = ref(today())
  const meal = ref<Meal>(currentMeal())
  let ready: Promise<void> | null = null

  async function login(): Promise<void> {
    const expired = Number(uni.getStorageSync(TOKEN_EXPIRED_KEY) || 0)
    if (uni.getStorageSync(TOKEN_KEY) && expired > Date.now()) return
    const { code } = await uni.login({ provider: 'weixin' })
    const res = await menuCo().login(code)
    // uniCloud 客户端会自动把 uni_id_token 带给云对象
    uni.setStorageSync(TOKEN_KEY, res.token)
    uni.setStorageSync(TOKEN_EXPIRED_KEY, res.tokenExpired)
    uid.value = res.uid
  }

  async function refreshFamily(): Promise<void> {
    family.value = await menuCo().getFamily()
  }

  /** 各页面 onShow 时调用；只在首次真正登录 */
  function ensureReady(): Promise<void> {
    if (!ready) {
      ready = login()
        .then(refreshFamily)
        .catch((err) => {
          ready = null
          throw err
        })
    }
    return ready
  }

  return { uid, family, date, meal, ensureReady, refreshFamily }
})
