import type { Dish, DishInput, Family, Meal, Menu, ShoppingItem } from '@/types/models'

/** 云对象 menu-co 的前端类型（实现见 uniCloud-aliyun/cloudfunctions/menu-co） */
interface MenuCo {
  login(code: string, nickname?: string): Promise<{ token: string; tokenExpired: number; uid: string }>
  getFamily(): Promise<Family | null>
  createFamily(name: string): Promise<Family>
  joinFamily(inviteCode: string): Promise<Family>
  setNickname(nickname: string): Promise<Family>
  listDishes(): Promise<Dish[]>
  getDish(id: string): Promise<Dish>
  saveDish(dish: DishInput): Promise<string>
  removeDish(id: string): Promise<void>
  getMenu(date: string, meal: Meal): Promise<Menu>
  toggleOrder(date: string, meal: Meal, dishId: string): Promise<Menu>
  setDone(date: string, meal: Meal, dishId: string, done: boolean): Promise<Menu>
  getShopping(date: string, meal: Meal): Promise<ShoppingItem[]>
  setBought(date: string, meal: Meal, name: string, bought: boolean): Promise<void>
}

let instance: MenuCo | null = null

/** 懒加载云对象；customUI 让各页面自行处理 loading 和报错 */
export function menuCo(): MenuCo {
  if (!instance) {
    // 未关联服务空间时 uniCloud 是占位实现，importObject 返回 undefined
    const obj = uniCloud.importObject('menu-co', { customUI: true }) as unknown as MenuCo | undefined
    if (!obj) {
      throw new Error('未连接 uniCloud 服务空间：请在 HBuilderX 中关联服务空间，并用「运行到小程序模拟器」启动')
    }
    instance = obj
  }
  return instance
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) return String(err.errMsg)
  if (err instanceof Error) return err.message
  return '出错了，请稍后再试'
}
