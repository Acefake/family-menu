import type { Category, Dish, DishInput, Family, Meal, ServeInput, Shopping, Slot } from '@/types/models'

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
  setNickname(nickname: string): Promise<Family>
  listDishes(): Promise<Dish[]>
  importHomeDishes(): Promise<number>
  getDish(id: string): Promise<Dish>
  saveDish(dish: DishInput): Promise<string>
  draftDish(
    input: string
  ): Promise<
    Pick<DishInput, 'name' | 'category' | 'subCategory' | 'minutes' | 'tags' | 'ingredients' | 'steps'>
  >
  generateDishImage(input: { name: string; ingredients?: string[] }): Promise<string>
  removeDish(id: string): Promise<void>
  getSlot(date: string, meal: Meal): Promise<Slot>
  listSlots(from: string, to: string): Promise<Slot[]>
  submitSelection(date: string, meal: Meal, dishIds: string[], note?: string): Promise<Slot>
  removeFromSlot(date: string, meal: Meal, dishId: string): Promise<Slot>
  confirmSlot(date: string, meal: Meal): Promise<Slot>
  reopenSlot(date: string, meal: Meal): Promise<Slot>
  serveSlot(date: string, meal: Meal, input: ServeInput): Promise<void>
  listServed(month: string): Promise<Slot[]>
  getShopping(from: string, to: string): Promise<Shopping>
  setBought(from: string, to: string, name: string, bought: boolean): Promise<void>
  setPantry(name: string, have: boolean): Promise<void>
}

let instance: MenuCo | null = null

/** 懒加载云对象；customUI 让各页面自行处理 loading 和报错 */
export function menuCo(): MenuCo {
  if (!instance) {
    instance = uniCloud.importObject('menu-co', { customUI: true }) as unknown as MenuCo
  }
  return instance
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) return String(err.errMsg)
  if (err instanceof Error) return err.message
  return '出错了，请稍后再试'
}
