import type {
  AiSettings,
  Category,
  Dish,
  DishDraft,
  DishInput,
  Family,
  Meal,
  ServeInput,
  Shopping,
  Slot,
} from '@/types/models'

/** 云对象 menu-co 的前端类型（实现见 uniCloud-alipay/cloudfunctions/menu-co） */
interface MenuCo {
  login(code: string, nickname?: string): Promise<{ token: string; tokenExpired: number; uid: string }>
  getFamily(): Promise<Family | null>
  createFamily(name: string): Promise<Family>
  joinFamily(inviteCode: string): Promise<Family>
  saveCategories(
    list: { id?: string; name: string; subs?: { id?: string; name: string }[] }[]
  ): Promise<Category[]>
  leaveFamily(): Promise<void>
  previewInvite(inviteCode: string): Promise<{ name: string; memberCount: number } | null>
  /** 保存当前用户头像，空字符串恢复默认。 */
  setAvatar(avatarId: string): Promise<Family>
  /** 复用家庭图片服务生成预览，不替换当前头像。 */
  generateAvatar(description: string): Promise<string>
  /** 只能采用当前用户自己生成的头像。 */
  useGeneratedAvatar(fileID: string): Promise<Family>
  setNickname(nickname: string): Promise<Family>
  listDishes(): Promise<Dish[]>
  importHomeDishes(): Promise<number>
  getDish(id: string): Promise<Dish>
  saveDish(dish: DishInput): Promise<string>
  /** 新建菜第一步：菜名、分类、用时、标签、食材（做法留空），返回得快 */
  draftDishBasics(input: string): Promise<DishDraft>
  /** 新建菜第二步：按菜名和食材写做法 */
  draftDishSteps(input: {
    name: string
    ingredients: DishDraft['ingredients']
    instruction: string
  }): Promise<{ steps: string[] }>
  reviseDish(input: {
    dish: DishDraft
    instruction: string
    history?: { role: 'me' | 'ai'; text: string }[]
  }): Promise<{ reply: string; dish: DishDraft }>
  generateDishImage(input: { name: string; ingredients?: string[] }): Promise<string>
  getAiSettings(): Promise<AiSettings>
  setAiSettings(input: { text: string; image: string }): Promise<AiSettings>
  removeDish(id: string): Promise<void>
  getSlot(date: string, meal: Meal): Promise<Slot>
  listSlots(from: string, to: string): Promise<Slot[]>
  submitSelection(date: string, meal: Meal, dishIds: string[], note?: string): Promise<Slot>
  removeFromSlot(date: string, meal: Meal, dishId: string): Promise<Slot>
  confirmSlot(date: string, meal: Meal): Promise<Slot>
  reopenSlot(date: string, meal: Meal): Promise<Slot>
  serveSlot(date: string, meal: Meal, input: ServeInput): Promise<void>
  /** 重新编辑已开饭的一顿：做了哪些菜、评分、整桌照 */
  updateServed(date: string, meal: Meal, input: ServeInput): Promise<void>
  /** 删除已开饭的一条记录：这顿回到「已确认」，菜的做过次数退回 */
  deleteServed(date: string, meal: Meal): Promise<void>
  listServed(month: string): Promise<Slot[]>
  getShopping(from: string, to: string): Promise<Shopping>
  setBought(from: string, to: string, name: string, bought: boolean): Promise<void>
  setPantry(name: string, have: boolean): Promise<void>
}

let instance: MenuCo | null = null
let relogin: (() => Promise<void>) | null = null
let reloginRunning: Promise<void> | null = null

/** 登录模块注册「清掉旧令牌并重新登录」的做法；令牌被云端拒绝时用它 */
export function setRelogin(handler: () => Promise<void>): void {
  relogin = handler
}

function isTokenInvalid(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'errCode' in err && err.errCode === 'TOKEN_INVALID'
}

/**
 * 令牌被云端拒绝（过期、云端换了密钥）时，重新登录一次再重试这次调用，
 * 不然本地缓存的令牌没到过期时间就一直用，页面会一直卡在「登录已过期」。
 * 同时发出的几个请求共用一次重新登录；login 本身不重试，重试也只一次。
 */
function withRelogin(co: MenuCo): MenuCo {
  return new Proxy(co, {
    get(target, key, receiver) {
      const member = Reflect.get(target, key, receiver)
      if (typeof key !== 'string' || key === 'then' || key === 'login' || typeof member !== 'function') {
        return member
      }
      const call = member as (...args: unknown[]) => Promise<unknown>
      return async (...args: unknown[]) => {
        try {
          return await call(...args)
        } catch (err) {
          if (!relogin || !isTokenInvalid(err)) throw err
          reloginRunning ??= relogin().finally(() => {
            reloginRunning = null
          })
          await reloginRunning
          return call(...args)
        }
      }
    },
  })
}

/** 懒加载云对象；customUI 让各页面自行处理 loading 和报错 */
export function menuCo(): MenuCo {
  if (!instance) {
    instance = withRelogin(uniCloud.importObject('menu-co', { customUI: true }) as unknown as MenuCo)
  }
  return instance
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) return String(err.errMsg)
  if (err instanceof Error) return err.message
  return '出错了，请稍后再试'
}
