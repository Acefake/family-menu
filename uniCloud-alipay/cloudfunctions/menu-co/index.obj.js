'use strict'

const { createHash } = require('crypto')
const { code2Session, createToken, loadConfig, verifyToken } = require('fm-common')
const homeDishes = require('./home-dishes.json')

const db = uniCloud.database()
const dbCmd = db.command
const users = db.collection('fm-user')
const families = db.collection('fm-family')
const dishes = db.collection('fm-dish')
const menus = db.collection('fm-menu')

const MEALS = ['breakfast', 'lunch', 'dinner']
const DEFAULT_CATEGORIES = [
  { id: 'meat', name: '荤菜' },
  { id: 'veg', name: '素菜' },
  { id: 'soup', name: '汤' },
  { id: 'staple', name: '主食' },
  { id: 'other', name: '其他' },
]
const MAX_CATEGORIES = 12
const FALLBACK_CATEGORY = 'other'
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const PUBLIC_METHODS = ['login']
const MAX_PICKS = 30
const MAX_RANGE_DAYS = 14
const MAX_RATING = 5

function fail(errMsg, errCode = 'INVALID_PARAM') {
  const err = new Error(errMsg)
  err.errCode = errCode
  err.errMsg = errMsg
  return err
}

function text(value, max, field) {
  if (typeof value !== 'string' || !value.trim()) throw fail(`${field}不能为空`)
  return value.trim().slice(0, max)
}

function checkSlot(date, meal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw fail('日期格式应为 YYYY-MM-DD')
  if (!MEALS.includes(meal)) throw fail('餐次无效')
}

function names(list, maxCount, maxLen) {
  return (Array.isArray(list) ? list : [])
    .map((v) => String(v).trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxCount)
}

function shortText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** 需要已加入家庭的方法调用（云对象会剔除下划线开头的自定义方法，故不能挂在 this 上） */
function familyIdOf(user) {
  if (!user.familyId) throw fail('请先创建或加入家庭', 'NO_FAMILY')
  return user.familyId
}

/** 家庭自己的分类；没改过就用默认的五类 */
function categoriesOf(family) {
  return Array.isArray(family.categories) && family.categories.length ? family.categories : DEFAULT_CATEGORIES
}

/** 菜归到不存在的分类时的去处：有「其他」归「其他」，否则归第一个 */
function fallbackCategoryId(categories) {
  return (categories.find((c) => c.id === FALLBACK_CATEGORY) || categories[0]).id
}

function resolveCategory(categories, id) {
  return categories.some((c) => c.id === id) ? id : fallbackCategoryId(categories)
}

async function loadFamilyDoc(familyId) {
  const { data } = await families.doc(familyId).get()
  if (!data.length) throw fail('家庭不存在', 'NOT_FOUND')
  return data[0]
}

async function loadFamily(user) {
  if (!user.familyId) return null
  const { data } = await families.doc(user.familyId).get()
  if (!data.length) return null
  const members = await users.where({ familyId: user.familyId }).field({ nickname: true }).get()
  return {
    _id: data[0]._id,
    name: data[0].name,
    inviteCode: data[0].inviteCode,
    pantry: data[0].pantry || [],
    categories: categoriesOf(data[0]),
    members: members.data.map((u) => ({ uid: u._id, nickname: u.nickname })),
  }
}

async function loadDish(user, id) {
  const { data } = await dishes.where({ _id: text(id, 64, 'id'), familyId: familyIdOf(user) }).get()
  if (!data.length) throw fail('这道菜不存在或已删除', 'NOT_FOUND')
  return data[0]
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw fail('日期格式应为 YYYY-MM-DD')
}

function emptySlot(familyId, date, meal) {
  return { familyId, date, meal, status: 'open', selections: [], bought: {} }
}

/** 补齐缺的字段：升级前留下的旧菜单没有 status / selections，不能让前端读到 undefined */
function normalizeSlot(slot) {
  return {
    ...slot,
    status: slot.status || 'open',
    selections: slot.selections || [],
    bought: slot.bought || {},
  }
}

async function loadSlot(familyId, date, meal) {
  checkSlot(date, meal)
  const { data } = await menus.where({ familyId, date, meal }).limit(1).get()
  return data[0] ? normalizeSlot(data[0]) : emptySlot(familyId, date, meal)
}

/** 取这一顿的文档，不存在就建一个；并发建出重复文档时，由唯一索引兜底后重取 */
async function loadSlotDoc(familyId, date, meal) {
  const slot = await loadSlot(familyId, date, meal)
  if (slot._id) return slot
  try {
    const res = await menus.add(slot)
    return { ...slot, _id: res.id }
  } catch (err) {
    const { data } = await menus.where({ familyId, date, meal }).limit(1).get()
    if (data.length) return data[0]
    throw err
  }
}

async function loadRange(familyId, from, to) {
  checkDate(from)
  checkDate(to)
  if (from > to) throw fail('起止日期不对')
  const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000
  if (days > MAX_RANGE_DAYS) throw fail(`一次最多看 ${MAX_RANGE_DAYS + 1} 天`)
  const { data } = await menus
    .where({ familyId, date: dbCmd.gte(from).and(dbCmd.lte(to)) })
    .limit(100)
    .get()
  return data.map(normalizeSlot)
}

/** 一顿里所有人点的菜去重后的 ID，保持先点先排 */
function slotDishIds(slot) {
  const ids = []
  for (const sel of slot.selections) {
    for (const id of sel.dishIds) if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

/** 给并发导入选出相同的 ID，跳过已删除菜品保留的 ID。 */
async function availableHomeDishId(familyId, key) {
  for (let revision = 0; ; revision++) {
    const id = createHash('sha256')
      .update(`home-dish:${familyId}:${key}:${revision}`)
      .digest('hex')
      .slice(0, 24)
    const { data } = await dishes.doc(id).get()
    if (!data.length) return id
    if (data[0].familyId === familyId) return null
  }
}

/** 导入单道菜，跳过已有同名菜和重复的导入请求。 */
async function addHomeDish(familyId, categories, { key, ...recipe }) {
  const { data } = await dishes.where({ familyId, name: recipe.name }).limit(1).get()
  if (data.length) return false

  const id = await availableHomeDishId(familyId, key)
  if (!id) return false
  const now = Date.now()
  try {
    await dishes.add({
      ...recipe,
      category: resolveCategory(categories, recipe.category),
      _id: id,
      familyId,
      homeTemplate: true,
      photo: `/static/dishes/${key}.jpg`,
      timesEaten: 0,
      lastEatenAt: null,
      createdAt: now,
      updatedAt: now,
    })
    return true
  } catch (err) {
    const { data: existing } = await dishes.where({ _id: id, familyId }).limit(1).get()
    if (existing.length) return false
    throw err
  }
}

module.exports = {
  async _before() {
    if (PUBLIC_METHODS.includes(this.getMethodName())) return
    this.config = loadConfig()
    const uid = verifyToken(this.getUniIdToken(), this.config)
    if (!uid) throw fail('登录已过期，请重新进入小程序', 'TOKEN_INVALID')
    const { data } = await users.doc(uid).get()
    if (!data.length) throw fail('用户不存在', 'TOKEN_INVALID')
    this.user = data[0]
  },

  async login(code, nickname) {
    const config = loadConfig()
    const openid = await code2Session(text(code, 128, 'code'), config)
    const { data } = await users.where({ openid }).limit(1).get()
    let uid
    if (data.length) {
      uid = data[0]._id
    } else {
      const res = await users.add({
        openid,
        nickname: typeof nickname === 'string' && nickname.trim() ? nickname.trim().slice(0, 12) : '家人',
        familyId: '',
        createdAt: Date.now(),
      })
      uid = res.id
    }
    return { uid, ...createToken(uid, config) }
  },

  async getFamily() {
    return loadFamily(this.user)
  },

  async createFamily(name) {
    if (this.user.familyId) throw fail('你已经在一个家庭里了')
    let inviteCode = ''
    for (let i = 0; i < 10 && !inviteCode; i++) {
      const candidate = Array.from(
        { length: 4 },
        () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      ).join('')
      const { total } = await families.where({ inviteCode: candidate }).count()
      if (!total) inviteCode = candidate
    }
    if (!inviteCode) throw fail('邀请码生成失败，请重试', 'INTERNAL')
    const res = await families.add({
      name: text(name, 20, '家庭名'),
      inviteCode,
      ownerId: this.user._id,
      createdAt: Date.now(),
    })
    await users.doc(this.user._id).update({ familyId: res.id })
    this.user.familyId = res.id
    return loadFamily(this.user)
  },

  async joinFamily(inviteCode) {
    if (this.user.familyId) throw fail('你已经在一个家庭里了')
    const { data } = await families
      .where({ inviteCode: text(inviteCode, 8, '邀请码').toUpperCase() })
      .limit(1)
      .get()
    if (!data.length) throw fail('邀请码不对，再核对一下')
    await users.doc(this.user._id).update({ familyId: data[0]._id })
    this.user.familyId = data[0]._id
    return loadFamily(this.user)
  },

  /**
   * 整体保存家庭的菜品分类（顺序即显示顺序）。已有分类带 id 只改名字，新增的不带 id；
   * 被删掉的分类下的菜自动挪到「其他」（没有就挪到第一个分类）。
   */
  async saveCategories(list) {
    const familyId = familyIdOf(this.user)
    if (!Array.isArray(list) || !list.length) throw fail('至少留一个分类')
    if (list.length > MAX_CATEGORIES) throw fail(`分类最多 ${MAX_CATEGORIES} 个`)
    const family = await loadFamilyDoc(familyId)
    const before = categoriesOf(family)
    const known = new Set(before.map((c) => c.id))
    const seenNames = new Set()
    const next = list.map((item) => {
      const name = text(item && item.name, 6, '分类名')
      if (seenNames.has(name)) throw fail(`分类「${name}」重复了`)
      seenNames.add(name)
      const id =
        item.id && known.has(item.id)
          ? item.id
          : `c${createHash('sha256').update(`${familyId}:${name}:${Date.now()}`).digest('hex').slice(0, 10)}`
      return { id, name }
    })
    const nextIds = new Set(next.map((c) => c.id))
    const removed = before.filter((c) => !nextIds.has(c.id)).map((c) => c.id)
    if (removed.length) {
      await dishes
        .where({ familyId, category: dbCmd.in(removed) })
        .update({ category: fallbackCategoryId(next) })
    }
    await families.doc(familyId).update({ categories: dbCmd.set(next) })
    return next
  },

  /** 退出当前家庭。家庭的菜谱和记录都留着，拿邀请码还能再加入 */
  async leaveFamily() {
    familyIdOf(this.user)
    await users.doc(this.user._id).update({ familyId: '' })
    this.user.familyId = ''
  },

  /** 点开邀请卡片时先看看是哪个家庭，不加入 */
  async previewInvite(inviteCode) {
    const { data } = await families
      .where({ inviteCode: text(inviteCode, 8, '邀请码').toUpperCase() })
      .limit(1)
      .get()
    if (!data.length) return null
    const { total } = await users.where({ familyId: data[0]._id }).count()
    return { name: data[0].name, memberCount: total }
  },

  async setNickname(nickname) {
    await users.doc(this.user._id).update({ nickname: text(nickname, 12, '称呼') })
    return loadFamily(this.user)
  },

  async listDishes() {
    const { data } = await dishes
      .where({ familyId: familyIdOf(this.user) })
      .limit(500)
      .get()
    return data
  },

  /** 导入此家庭缺少的家常菜模板，返回新增道数。 */
  async importHomeDishes() {
    const familyId = familyIdOf(this.user)
    const categories = categoriesOf(await loadFamilyDoc(familyId))
    let added = 0
    for (const recipe of homeDishes) {
      if (await addHomeDish(familyId, categories, recipe)) added++
    }
    return added
  },

  async getDish(id) {
    return loadDish(this.user, id)
  },

  async saveDish(input) {
    const familyId = familyIdOf(this.user)
    if (!input || typeof input !== 'object') throw fail('参数无效')
    const categories = categoriesOf(await loadFamilyDoc(familyId))
    const doc = {
      name: text(input.name, 30, '菜名'),
      photo: typeof input.photo === 'string' ? input.photo.slice(0, 500) : '',
      category: resolveCategory(categories, input.category),
      tags: (Array.isArray(input.tags) ? input.tags : []).map(String).slice(0, 10),
      minutes: Number(input.minutes) > 0 ? Math.min(Math.round(Number(input.minutes)), 1440) : null,
      ingredients: (Array.isArray(input.ingredients) ? input.ingredients : [])
        .slice(0, 50)
        .map((i) => ({
          name: String(i.name || '').slice(0, 20),
          qty: String(i.qty || '').slice(0, 20),
        }))
        .filter((i) => i.name),
      steps: (Array.isArray(input.steps) ? input.steps : []).map(String).slice(0, 30),
      updatedAt: Date.now(),
    }
    if (input._id) {
      const res = await dishes.where({ _id: text(input._id, 64, 'id'), familyId }).update(doc)
      if (!res.updated && !res.matched) throw fail('这道菜不存在或已删除', 'NOT_FOUND')
      return input._id
    }
    const res = await dishes.add({
      ...doc,
      familyId,
      timesEaten: 0,
      lastEatenAt: null,
      createdAt: Date.now(),
    })
    return res.id
  },

  async removeDish(id) {
    const query = dishes.where({ _id: text(id, 64, 'id'), familyId: familyIdOf(this.user) })
    const { data } = await query.get()
    if (!data[0]?.homeTemplate) {
      await query.remove()
      return
    }

    // 保留 ID 供后续导入避让，同时让旧菜单和编辑页查不到这道菜。
    await query.update({
      familyId: '',
      name: '',
      photo: dbCmd.remove(),
      category: dbCmd.remove(),
      tags: dbCmd.remove(),
      minutes: dbCmd.remove(),
      ingredients: dbCmd.remove(),
      steps: dbCmd.remove(),
      timesEaten: dbCmd.remove(),
      lastEatenAt: dbCmd.remove(),
      updatedAt: Date.now(),
    })
  },

  /** 这一顿的单：每位成员点的菜、掌勺确认状态 */
  async getSlot(date, meal) {
    return loadSlot(familyIdOf(this.user), date, meal)
  },

  /** 一段日期里有菜的各顿，日期条的小圆点、买菜清单都用它 */
  async listSlots(from, to) {
    return loadRange(familyIdOf(this.user), from, to)
  },

  /** 提交我在这一顿想吃的菜（整体替换我自己的，不动别人的）；传空数组表示我不点了 */
  async submitSelection(date, meal, dishIds, note) {
    const familyId = familyIdOf(this.user)
    const ids = [...new Set(names(dishIds, MAX_PICKS, 64))]
    if (ids.length) {
      const { data } = await dishes
        .where({ _id: dbCmd.in(ids), familyId })
        .field({ _id: true })
        .get()
      if (data.length !== ids.length) throw fail('有的菜已经不在菜谱里了，刷新一下再选', 'NOT_FOUND')
    }
    const slot = await loadSlotDoc(familyId, date, meal)
    if (slot.status === 'served') throw fail('这顿已经开饭了，不能再改')
    const mine = { uid: this.user._id, name: this.user.nickname, dishIds: ids, note: shortText(note, 40) }
    const others = slot.selections.filter((sel) => sel.uid !== this.user._id)
    const selections = ids.length ? [...others, mine] : others
    await menus.doc(slot._id).update({ selections })
    return { ...slot, selections }
  },

  /** 把一道菜从这一顿拿掉：不管是谁点的（家里人都能管），所有人的选择里都去掉它 */
  async removeFromSlot(date, meal, dishId) {
    const familyId = familyIdOf(this.user)
    const slot = await loadSlot(familyId, date, meal)
    if (!slot._id) return slot
    if (slot.status === 'served') throw fail('这顿已经开饭了，不能再改')
    const id = text(dishId, 64, 'id')
    const selections = slot.selections
      .map((sel) => ({ ...sel, dishIds: sel.dishIds.filter((d) => d !== id) }))
      .filter((sel) => sel.dishIds.length)
    const patch = { selections }
    // 都拿光了就回到没人点菜的状态，不留一个空的「已确认」
    if (!selections.length && slot.status === 'confirmed') {
      patch.status = 'open'
      patch.confirmedBy = dbCmd.remove()
    }
    await menus.doc(slot._id).update(patch)
    return { ...slot, selections, status: patch.status || slot.status }
  },

  /** 掌勺确认这一顿 */
  async confirmSlot(date, meal) {
    const familyId = familyIdOf(this.user)
    const slot = await loadSlot(familyId, date, meal)
    if (!slot._id || !slotDishIds(slot).length) throw fail('还没有人点菜')
    if (slot.status === 'served') throw fail('这顿已经开饭了')
    const patch = { status: 'confirmed', confirmedBy: this.user.nickname }
    await menus.doc(slot._id).update(patch)
    return { ...slot, ...patch }
  },

  async reopenSlot(date, meal) {
    const familyId = familyIdOf(this.user)
    const slot = await loadSlot(familyId, date, meal)
    if (slot.status !== 'confirmed') return slot
    await menus.doc(slot._id).update({ status: 'open', confirmedBy: dbCmd.remove() })
    return { ...slot, status: 'open', confirmedBy: undefined }
  },

  /** 开饭：勾出真正做了的菜各记一次，可以打分、拍整桌照；没勾的菜算没做 */
  async serveSlot(date, meal, input) {
    const familyId = familyIdOf(this.user)
    const slot = await loadSlot(familyId, date, meal)
    if (!slot._id) throw fail('这顿还没有点菜')
    if (slot.status === 'served') throw fail('这顿已经开饭了')
    const all = slotDishIds(slot)
    const cooked = names(input && input.cookedIds, MAX_PICKS, 64).filter((id) => all.includes(id))
    if (!cooked.length) throw fail('至少勾一道做好的菜')
    const rawRatings = (input && input.ratings) || {}
    const ratings = {}
    for (const id of cooked) {
      const r = Math.round(Number(rawRatings[id]) || 0)
      if (r >= 1 && r <= MAX_RATING) ratings[id] = r
    }
    const servedAt = Date.now()
    await menus.doc(slot._id).update({
      status: 'served',
      cooked,
      ratings: dbCmd.set(ratings),
      photo: shortText(input && input.photo, 500),
      servedAt,
    })
    await dishes
      .where({ _id: dbCmd.in(cooked), familyId })
      .update({ timesEaten: dbCmd.inc(1), lastEatenAt: servedAt })
  },

  /** 某月开过饭的单，month 为 YYYY-MM */
  async listServed(month) {
    if (!/^\d{4}-\d{2}$/.test(String(month))) throw fail('月份格式应为 YYYY-MM')
    const { data } = await menus
      .where({ familyId: familyIdOf(this.user), status: 'served', date: new RegExp(`^${month}-`) })
      .limit(100)
      .get()
    return data.map(normalizeSlot)
  },

  /** 一段日期里没开饭的各顿合并出买菜清单；家里有的食材单独归到 stocked */
  async getShopping(from, to) {
    const familyId = familyIdOf(this.user)
    const slots = (await loadRange(familyId, from, to)).filter((slot) => slot.status !== 'served')
    const ids = [...new Set(slots.flatMap(slotDishIds))]
    if (!ids.length) return { items: [], stocked: [] }
    const [{ data: dishList }, family] = await Promise.all([
      dishes.where({ _id: dbCmd.in(ids), familyId }).get(),
      families.doc(familyId).get(),
    ])
    const pantry = new Set(family.data[0]?.pantry || [])
    const byId = new Map(dishList.map((d) => [d._id, d]))
    const merged = new Map()
    for (const slot of slots) {
      for (const id of slotDishIds(slot)) {
        const dish = byId.get(id)
        if (!dish) continue
        for (const ing of dish.ingredients || []) {
          const entry = merged.get(ing.name) || { name: ing.name, qty: [], fromDishes: [], slots: [] }
          if (ing.qty) entry.qty.push(ing.qty)
          if (!entry.fromDishes.includes(dish.name)) entry.fromDishes.push(dish.name)
          if (!entry.slots.includes(slot._id)) entry.slots.push(slot._id)
          merged.set(ing.name, entry)
        }
      }
    }
    const items = []
    const stocked = []
    for (const entry of merged.values()) {
      const bought = entry.slots.every((slotId) => {
        const slot = slots.find((it) => it._id === slotId)
        return Boolean((slot.bought || {})[entry.name])
      })
      const row = { name: entry.name, qty: entry.qty, fromDishes: entry.fromDishes, bought }
      ;(pantry.has(entry.name) ? stocked : items).push(row)
    }
    return { items, stocked }
  },

  /** 勾选已买：这段日期里每一顿都记上 */
  async setBought(from, to, name, bought) {
    const familyId = familyIdOf(this.user)
    const key = text(name, 30, '食材')
    const slots = (await loadRange(familyId, from, to)).filter((slot) => slot.status !== 'served')
    for (const slot of slots) {
      // bought 是对象，用 set 整体替换，避免嵌套合并语义差异
      const next = { ...(slot.bought || {}), [key]: Boolean(bought) }
      await menus.doc(slot._id).update({ bought: dbCmd.set(next) })
    }
  },

  /** 家里有的食材（全家共用），买菜清单里不再提醒 */
  async setPantry(name, have) {
    const familyId = familyIdOf(this.user)
    const item = text(name, 20, '食材')
    await families.doc(familyId).update({ pantry: have ? dbCmd.addToSet(item) : dbCmd.pull(item) })
  },
}
