/** 与 uniCloud-alipay/database/*.schema.json 对应的前端类型 */

export type Meal = 'breakfast' | 'lunch' | 'dinner'

export const MEALS: { value: Meal; label: string }[] = [
  { value: 'breakfast', label: '早饭' },
  { value: 'lunch', label: '午饭' },
  { value: 'dinner', label: '晚饭' },
]

/** 分类由家庭自己维护，这里只存 ID；默认有 meat / veg / soup / staple / other 五个 */
export type DishCategory = string

/** 一级分类下的二级分类，比如「荤菜」下的猪肉 / 牛羊 / 鸡鸭 */
export interface SubCategory {
  id: string
  name: string
}

export interface Category {
  id: DishCategory
  name: string
  subs?: SubCategory[]
}

const TONES = ['meat', 'veg', 'soup', 'staple'] as const

/** 标签配色：默认几类用固定的色，自己加的分类按 ID 稳定地挑一个 */
export function categoryTone(id: DishCategory): string {
  if ([...TONES, 'other'].includes(id)) return id
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export function categoryName(categories: Category[], id: DishCategory): string {
  return categories.find((c) => c.id === id)?.name ?? '未分类'
}

export function subCategoryName(categories: Category[], id: DishCategory, subId?: string): string {
  return categories.find((c) => c.id === id)?.subs?.find((s) => s.id === subId)?.name ?? ''
}

export const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.value, m.label])) as Record<Meal, string>

export interface Member {
  uid: string
  nickname: string
}

export interface Family {
  _id: string
  name: string
  inviteCode: string
  /** 家里有的食材 */
  pantry: string[]
  categories: Category[]
  members: Member[]
}

export interface Ingredient {
  name: string
  qty: string
}

export interface Dish {
  _id: string
  familyId: string
  name: string
  photo?: string
  category: DishCategory
  /** 二级分类 ID，空表示没细分 */
  subCategory?: string
  tags: string[]
  minutes?: number
  ingredients: Ingredient[]
  steps: string[]
  timesEaten: number
  lastEatenAt?: number
}

export type DishInput = Omit<Dish, '_id' | 'familyId' | 'timesEaten' | 'lastEatenAt'> & {
  _id?: string
}

/** 某位家人在这一顿想吃的菜 */
export interface Selection {
  uid: string
  name: string
  dishIds: string[]
  note: string
}

/** open 在点菜 / confirmed 掌勺已确认 / served 已开饭 */
export type SlotStatus = 'open' | 'confirmed' | 'served'

/** 某天某一顿：各家人点的菜合成一张单 */
export interface Slot {
  _id?: string
  familyId: string
  /** YYYY-MM-DD */
  date: string
  meal: Meal
  status: SlotStatus
  selections: Selection[]
  confirmedBy?: string
  /** 买菜清单勾选状态，key 为食材名 */
  bought: Record<string, boolean>
  /** 开饭时真正做了的菜 */
  cooked?: string[]
  ratings?: Record<string, number>
  photo?: string
  servedAt?: number
}

export interface ServeInput {
  cookedIds: string[]
  ratings: Record<string, number>
  photo?: string
}

export interface ShoppingItem {
  name: string
  qty: string[]
  fromDishes: string[]
  bought: boolean
}

export interface Shopping {
  items: ShoppingItem[]
  /** 家里已有的食材，不用买 */
  stocked: ShoppingItem[]
}
