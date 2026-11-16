/** 与 uniCloud-alipay/database/*.schema.json 对应的前端类型 */

export type Meal = 'breakfast' | 'lunch' | 'dinner'

export const MEALS: { value: Meal; label: string }[] = [
  { value: 'breakfast', label: '早饭' },
  { value: 'lunch', label: '午饭' },
  { value: 'dinner', label: '晚饭' },
]

export type DishCategory = 'meat' | 'veg' | 'soup' | 'staple' | 'other'

export const CATEGORIES: { value: DishCategory; label: string }[] = [
  { value: 'meat', label: '荤菜' },
  { value: 'veg', label: '素菜' },
  { value: 'soup', label: '汤' },
  { value: 'staple', label: '主食' },
  { value: 'other', label: '其他' },
]

export interface Member {
  uid: string
  nickname: string
}

export interface Family {
  _id: string
  name: string
  inviteCode: string
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

export interface MenuItem {
  dishId: string
  orderedBy: string
  done: boolean
}

export interface Menu {
  _id?: string
  familyId: string
  /** YYYY-MM-DD */
  date: string
  meal: Meal
  items: MenuItem[]
  /** 采购清单勾选状态，key 为食材名 */
  bought: Record<string, boolean>
}

export interface ShoppingItem {
  name: string
  qty: string[]
  fromDishes: string[]
  bought: boolean
}
