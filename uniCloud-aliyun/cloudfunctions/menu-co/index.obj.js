'use strict'

const { code2Session, createToken, loadConfig, verifyToken } = require('fm-common')

const db = uniCloud.database()
const dbCmd = db.command
const users = db.collection('fm-user')
const families = db.collection('fm-family')
const dishes = db.collection('fm-dish')
const menus = db.collection('fm-menu')

const MEALS = ['breakfast', 'lunch', 'dinner']
const CATEGORIES = ['meat', 'veg', 'soup', 'staple', 'other']
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const PUBLIC_METHODS = ['login']

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

  /** 需要已加入家庭的方法调用 */
  _familyId() {
    if (!this.user.familyId) throw fail('请先创建或加入家庭', 'NO_FAMILY')
    return this.user.familyId
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
    if (!this.user.familyId) return null
    const { data } = await families.doc(this.user.familyId).get()
    if (!data.length) return null
    const members = await users.where({ familyId: this.user.familyId }).field({ nickname: true }).get()
    return {
      _id: data[0]._id,
      name: data[0].name,
      inviteCode: data[0].inviteCode,
      members: members.data.map((u) => ({ uid: u._id, nickname: u.nickname })),
    }
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
    return this.getFamily()
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
    return this.getFamily()
  },

  async setNickname(nickname) {
    await users.doc(this.user._id).update({ nickname: text(nickname, 12, '称呼') })
    return this.getFamily()
  },

  async listDishes() {
    const { data } = await dishes.where({ familyId: this._familyId() }).limit(500).get()
    return data
  },

  async getDish(id) {
    const { data } = await dishes.where({ _id: text(id, 64, 'id'), familyId: this._familyId() }).get()
    if (!data.length) throw fail('这道菜不存在或已删除', 'NOT_FOUND')
    return data[0]
  },

  async saveDish(input) {
    const familyId = this._familyId()
    if (!input || typeof input !== 'object') throw fail('参数无效')
    const doc = {
      name: text(input.name, 30, '菜名'),
      photo: typeof input.photo === 'string' ? input.photo.slice(0, 500) : '',
      category: CATEGORIES.includes(input.category) ? input.category : 'other',
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
    await dishes.where({ _id: text(id, 64, 'id'), familyId: this._familyId() }).remove()
  },

  async getMenu(date, meal) {
    checkSlot(date, meal)
    const familyId = this._familyId()
    const { data } = await menus.where({ familyId, date, meal }).limit(1).get()
    return data[0] || { familyId, date, meal, items: [], bought: {} }
  },

  /** 取菜单文档，不存在则创建 */
  async _menuDoc(date, meal) {
    const menu = await this.getMenu(date, meal)
    if (menu._id) return menu
    const res = await menus.add(menu)
    return { ...menu, _id: res.id }
  },

  async toggleOrder(date, meal, dishId) {
    await this.getDish(dishId)
    const menu = await this._menuDoc(date, meal)
    const exists = menu.items.some((it) => it.dishId === dishId)
    const items = exists
      ? menu.items.filter((it) => it.dishId !== dishId)
      : [...menu.items, { dishId, orderedBy: this.user._id, done: false }]
    await menus.doc(menu._id).update({ items })
    return { ...menu, items }
  },

  async setDone(date, meal, dishId, done) {
    const menu = await this._menuDoc(date, meal)
    const item = menu.items.find((it) => it.dishId === dishId)
    if (!item) throw fail('这道菜不在菜单里')
    const next = Boolean(done)
    if (item.done !== next) {
      item.done = next
      await menus.doc(menu._id).update({ items: menu.items })
      // 「做好了」才算吃过一次
      await dishes
        .doc(dishId)
        .update(next ? { timesEaten: dbCmd.inc(1), lastEatenAt: Date.now() } : { timesEaten: dbCmd.inc(-1) })
    }
    return menu
  },

  async getShopping(date, meal) {
    const menu = await this.getMenu(date, meal)
    const ids = menu.items.map((it) => it.dishId)
    if (!ids.length) return []
    const { data } = await dishes.where({ _id: dbCmd.in(ids), familyId: menu.familyId }).get()
    const merged = new Map()
    for (const dish of data) {
      for (const ing of dish.ingredients || []) {
        const entry = merged.get(ing.name) || {
          name: ing.name,
          qty: [],
          fromDishes: [],
          bought: !!(menu.bought || {})[ing.name],
        }
        if (ing.qty) entry.qty.push(ing.qty)
        entry.fromDishes.push(dish.name)
        merged.set(ing.name, entry)
      }
    }
    return [...merged.values()]
  },

  async setBought(date, meal, name, bought) {
    const menu = await this._menuDoc(date, meal)
    // bought 是对象，用 set 整体替换，避免嵌套合并语义差异
    const next = { ...(menu.bought || {}), [text(name, 20, '食材')]: Boolean(bought) }
    await menus.doc(menu._id).update({ bought: dbCmd.set(next) })
  },
}
