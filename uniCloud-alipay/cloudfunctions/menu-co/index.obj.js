'use strict'

const { createHash } = require('crypto')
const {
  aiOptions,
  askJson,
  chooseProvider,
  code2Session,
  createToken,
  generateImage,
  loadConfig,
  verifyToken,
} = require('fm-common')
const homeDishes = require('./home-dishes.json')

const db = uniCloud.database()
const dbCmd = db.command
const users = db.collection('fm-user')
const families = db.collection('fm-family')
const dishes = db.collection('fm-dish')
const menus = db.collection('fm-menu')

const AVATAR_IDS = [
  'toddler-boy',
  'girl-clip',
  'boy-cap',
  'girl-braid',
  'young-man-glasses',
  'young-man-stripes',
  'young-woman-pixie',
  'young-woman-glasses',
  'dad-stubble',
  'mom-straight',
  'grandpa-bald',
  'grandma-bun',

  'boy',
  'girl',
  'boy-glasses',
  'girl-bob',
  'young-man',
  'young-woman',
  'middle-man',
  'middle-woman',
  'man-glasses',
  'woman-bun',
  'senior-man',
  'senior-woman',
  'baby',
  'dad',
  'mom',
  'grandpa',
  'grandma',
]

const MEALS = ['breakfast', 'lunch', 'dinner']
const DEFAULT_CATEGORIES = [
  {
    id: 'meat',
    name: '荤菜',
    subs: [
      { id: 'pork', name: '猪肉' },
      { id: 'beef', name: '牛羊' },
      { id: 'poultry', name: '鸡鸭' },
    ],
  },
  { id: 'veg', name: '素菜' },
  { id: 'soup', name: '汤' },
  { id: 'staple', name: '主食' },
  { id: 'other', name: '其他' },
]
const MAX_CATEGORIES = 12
const MAX_SUBS = 8
/** 默认「荤菜」子类的食材关键词，导入家常菜和 AI 草稿时据此猜二级分类 */
const SUB_KEYWORDS = [
  ['pork', ['猪', '五花', '排骨', '肉末', '肉丝', '肉片', '梅花肉', '里脊', '火腿', '培根']],
  ['beef', ['牛', '羊']],
  ['poultry', ['鸡', '鸭', '鹅']],
]
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

/** 二级分类必须属于所选的一级分类，否则当作没分 */
function resolveSub(categories, categoryId, subId) {
  const category = categories.find((c) => c.id === categoryId)
  return category && Array.isArray(category.subs) && category.subs.some((s) => s.id === subId) ? subId : ''
}

/** 按菜名和食材猜二级分类；家庭没有对应的默认子类时返回空 */
function guessSub(categories, categoryId, recipe) {
  const haystack = [recipe.name, ...(recipe.ingredients || []).map((i) => i.name)].join(' ')
  for (const [subId, words] of SUB_KEYWORDS) {
    if (words.some((w) => haystack.includes(w))) return resolveSub(categories, categoryId, subId)
  }
  return ''
}

async function loadFamilyDoc(familyId) {
  const { data } = await families.doc(familyId).get()
  if (!data.length) throw fail('家庭不存在', 'NOT_FOUND')
  return data[0]
}

/** 给 AI 看的分类清单：id=名称（二级：id=名称，…） */
function categoryHint(categories) {
  return categories
    .map(
      (c) =>
        `${c.id}=${c.name}${c.subs?.length ? `（二级：${c.subs.map((s) => `${s.id}=${s.name}`).join('，')}）` : ''}`
    )
    .join('；')
}

/** AI 菜谱 JSON 里基本信息的字段说明（不含做法），生成和修改共用 */
const BASIC_FIELDS =
  '字段：name 菜名；category 只能从下面的分类 id 里选一个；subCategory 是所选分类下的二级分类 id，没有合适的就省略；minutes 总用时（分钟，整数，不确定就省略）；' +
  'tags 口味或特点标签，最多 4 个，每个不超过 4 字；ingredients 数组，每项 {name, qty}，qty 带单位如"2个"，不确定写空字符串；'
/** 做法的字段说明 */
const STEPS_FIELD = 'steps 字符串数组，每步一句话。'
const RECIPE_FIELDS = BASIC_FIELDS + STEPS_FIELD

/**
 * 把 AI 吐出来的菜谱整理成能直接填表单的样子：截断长度、分类不在家庭里就归到兜底分类、猜二级分类。
 * 没有菜名时用 fallbackName；两个都没有返回 null。
 */
function recipeFrom(categories, draft, fallbackName = '') {
  if (!draft || typeof draft !== 'object') return null
  const name = String(typeof draft.name === 'string' && draft.name.trim() ? draft.name : fallbackName)
    .trim()
    .slice(0, 30)
  if (!name) return null
  const category = resolveCategory(categories, draft.category)
  const ingredients = (Array.isArray(draft.ingredients) ? draft.ingredients : [])
    .slice(0, 30)
    .map((i) => ({
      name: String((i && i.name) || '').slice(0, 20),
      qty: String((i && i.qty) || '').slice(0, 20),
    }))
    .filter((i) => i.name)
  return {
    name,
    category,
    subCategory:
      resolveSub(categories, category, draft.subCategory) ||
      guessSub(categories, category, { name, ingredients }),
    minutes: Number(draft.minutes) > 0 ? Math.min(Math.round(Number(draft.minutes)), 1440) : null,
    tags: names(draft.tags, 4, 6),
    ingredients,
    steps: names(draft.steps, 20, 200),
  }
}

/** 家庭当前用的 AI 服务商（文字、图片各一个）和可选项；没选过或选的那家没配 Key 时落到默认 */
function aiSettingsOf(config, family) {
  const saved = family.aiSettings || {}
  return {
    text: chooseProvider(config, 'text', saved.text),
    image: chooseProvider(config, 'image', saved.image),
    options: aiOptions(config),
  }
}

async function loadFamily(user) {
  if (!user.familyId) return null
  const { data } = await families.doc(user.familyId).get()
  if (!data.length) return null
  const members = await users
    .where({ familyId: user.familyId })
    .field({ nickname: true, avatarId: true, avatarImage: true })
    .get()
  return {
    _id: data[0]._id,
    name: data[0].name,
    inviteCode: data[0].inviteCode,
    pantry: data[0].pantry || [],
    categories: categoriesOf(data[0]),
    members: members.data.map((u) => ({
      uid: u._id,
      nickname: u.nickname,
      avatarId: u.avatarId,
      avatarImage: u.avatarImage,
    })),
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

/** 开饭 / 重新编辑共用：从请求里取出做了哪些菜、评分和整桌照，并按这一顿点过的菜校验 */
function servedInput(slot, input) {
  const all = slotDishIds(slot)
  const cooked = names(input && input.cookedIds, MAX_PICKS, 64).filter((id) => all.includes(id))
  if (!cooked.length) throw fail('至少勾一道做好的菜')
  const rawRatings = (input && input.ratings) || {}
  const ratings = {}
  for (const id of cooked) {
    const r = Math.round(Number(rawRatings[id]) || 0)
    if (r >= 1 && r <= MAX_RATING) ratings[id] = r
  }
  return { cooked, ratings, photo: shortText(input && input.photo, 500) }
}

/** 一批菜的「做过几次」加 / 减 delta，最少减到 0 */
async function adjustEaten(familyId, ids, delta) {
  if (!ids.length) return
  const { data } = await dishes
    .where({ _id: dbCmd.in(ids), familyId })
    .field({ timesEaten: true })
    .get()
  for (const dish of data) {
    await dishes.doc(dish._id).update({ timesEaten: Math.max(0, (dish.timesEaten || 0) + delta) })
  }
}

/** 重算一道菜「最近一次做好」：看还剩哪些已开饭的单里做了它，取最晚的；一次都没有就清空 */
async function refreshLastEaten(familyId, dishId) {
  const { data } = await menus
    .where({ familyId, status: 'served', cooked: dishId })
    .orderBy('servedAt', 'desc')
    .limit(1)
    .get()
  await dishes.where({ _id: dishId, familyId }).update({ lastEatenAt: data.length ? data[0].servedAt : null })
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
    const category = resolveCategory(categories, recipe.category)
    await dishes.add({
      ...recipe,
      category,
      subCategory: guessSub(categories, category, recipe),
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

  /**
   * 云端把方法里抛出的异常当成「函数执行失败」，客户端只会看到「用户函数代码语法或逻辑异常」，
   * 真实的 errCode / errMsg 都丢了，前端也没法按 TOKEN_INVALID 之类的错误码处理。
   * 这里把异常改成返回值：云对象返回 errCode 不为 0 的对象，客户端 SDK 会把它当作错误抛出，并保留原来的错误码和文字。
   */
  _after(error, result) {
    if (!error) return result
    // 没带 errCode 的是预料之外的异常，留一份堆栈到云端日志
    if (!error.errCode) console.error(error.stack || error)
    return {
      errCode: error.errCode || 'SYS_ERR',
      errMsg: error.errMsg || error.message || '服务出错了，请稍后再试',
    }
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
    const knownSubs = new Map(before.map((c) => [c.id, new Set((c.subs || []).map((s) => s.id))]))
    const newId = (prefix, ...parts) =>
      `${prefix}${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 10)}`
    const seenNames = new Set()
    const next = list.map((item, index) => {
      const name = text(item && item.name, 6, '分类名')
      if (seenNames.has(name)) throw fail(`分类「${name}」重复了`)
      seenNames.add(name)
      const id = item.id && known.has(item.id) ? item.id : newId('c', familyId, name, Date.now(), index)

      const rawSubs = Array.isArray(item.subs) ? item.subs : []
      if (rawSubs.length > MAX_SUBS) throw fail(`「${name}」下的二级分类最多 ${MAX_SUBS} 个`)
      const seenSubNames = new Set()
      const subs = rawSubs.map((sub, subIndex) => {
        const subName = text(sub && sub.name, 6, '二级分类名')
        if (seenSubNames.has(subName)) throw fail(`「${name}」下的「${subName}」重复了`)
        seenSubNames.add(subName)
        const subId =
          sub.id && knownSubs.get(id)?.has(sub.id)
            ? sub.id
            : newId('s', familyId, id, subName, Date.now(), subIndex)
        return { id: subId, name: subName }
      })
      return subs.length ? { id, name, subs } : { id, name }
    })

    const nextIds = new Set(next.map((c) => c.id))
    const removed = before.filter((c) => !nextIds.has(c.id)).map((c) => c.id)
    if (removed.length) {
      await dishes
        .where({ familyId, category: dbCmd.in(removed) })
        .update({ category: fallbackCategoryId(next), subCategory: '' })
    }
    // 删掉的二级分类：里面的菜回到「该一级分类下未细分」
    for (const c of next) {
      const kept = new Set((c.subs || []).map((s) => s.id))
      const gone = [...(knownSubs.get(c.id) || [])].filter((id) => !kept.has(id))
      if (gone.length) {
        await dishes
          .where({ familyId, category: c.id, subCategory: dbCmd.in(gone) })
          .update({ subCategory: '' })
      }
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

  /** 仅更改当前用户的头像；空串恢复默认。 */
  async setAvatar(avatarId) {
    if (typeof avatarId !== 'string' || (avatarId !== '' && !AVATAR_IDS.includes(avatarId))) {
      throw fail('请选择列表中的头像')
    }
    familyIdOf(this.user)
    await users.doc(this.user._id).update({ avatarId, avatarImage: '' })
    return loadFamily(this.user)
  },

  /** 生图沿用家庭的图片服务，先保存草稿，确认后才设为头像。 */
  async generateAvatar(description) {
    const family = await loadFamilyDoc(familyIdOf(this.user))
    const detail = text(description, 300, '头像描述')
    const prompt =
      '生成一张正方形家庭应用头像，温暖柔和的手绘水粉插画，纸张笔触，东亚卡通人物，棕色眼睛、红润脸颊、亲切神情，纯色浅色背景，完整头发和肩部居中，没有文字、水印和边框。人物特点：' +
      detail
    const fileID = await generateImage(
      this.config,
      prompt,
      `avatar/ai/${this.user._id}`,
      family.aiSettings?.image
    )
    await users.doc(this.user._id).update({ avatarDraft: fileID })
    return fileID
  },

  async useGeneratedAvatar(fileID) {
    familyIdOf(this.user)
    const { data } = await users.doc(this.user._id).get()
    const own = data[0]
    if (
      typeof fileID !== 'string' ||
      !fileID ||
      !own ||
      (own.avatarDraft !== fileID && own.avatarImage !== fileID)
    ) {
      throw fail('请先为自己生成头像，再保存')
    }
    await users.doc(this.user._id).update({ avatarImage: fileID, avatarId: '' })
    return loadFamily(this.user)
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
    const category = resolveCategory(categories, input.category)
    const doc = {
      name: text(input.name, 30, '菜名'),
      photo: typeof input.photo === 'string' ? input.photo.slice(0, 500) : '',
      category,
      subCategory: resolveSub(categories, category, input.subCategory),
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

  /**
   * 快捷录入：根据一句话（菜名或一段做法）让 AI 生成菜谱草稿，只返回不入库，
   * 前端填进表单让用户检查后再保存。
   */
  /**
   * 新建菜的第一步：只写基本信息和食材，返回得快，前端先填上表单。
   * 做法交给 draftDishSteps，和配图一起去写，哪个先好哪个先出现。
   */
  async draftDishBasics(input) {
    const family = await loadFamilyDoc(familyIdOf(this.user))
    const categories = categoriesOf(family)
    const content = text(input, 800, '内容')
    const system =
      '你是家常菜谱助手。根据用户给的菜名或做法，输出这道家常菜的基本信息 JSON，不含做法，不要输出其他文字。' +
      BASIC_FIELDS +
      '用户给了做法就按原意整理出食材，没给就按通行的家常做法。' +
      `分类：${categoryHint(categories)}`
    const draft = await askJson(this.config, system, content, family.aiSettings?.text)
    const recipe = recipeFrom(categories, draft)
    if (!recipe) throw fail('没识别出菜名，换个说法试试')
    // 做法留给第二步，模型要是顺带写了也丢掉，免得和第二步的结果打架
    return { ...recipe, steps: [] }
  },

  /** 新建菜的第二步：按菜名和食材写做法；用户原话里要是贴了做法，就按原意整理 */
  async draftDishSteps(input) {
    const family = await loadFamilyDoc(familyIdOf(this.user))
    const name = text(input && input.name, 30, '菜名')
    const ingredients = names(
      (Array.isArray(input.ingredients) ? input.ingredients : []).map(
        (i) => `${(i && i.name) || ''}${(i && i.qty) || ''}`
      ),
      30,
      40
    )
    const system =
      '你是家常菜谱助手。根据菜名和食材写这道家常菜的做法，输出 JSON：{"steps": 字符串数组}，每步一句话，最多 12 步，不要输出其他文字。' +
      '用户的话里要是贴了做法，就按原意整理，没贴就按通行的家常做法写。'
    const user = `菜名：${name}
食材：${ingredients.join('、') || '未给'}
用户的话：${shortText(input.instruction, 800) || name}`
    const out = await askJson(this.config, system, user, family.aiSettings?.text)
    const steps = names(out && out.steps, 20, 200)
    if (!steps.length) throw fail('AI 没写出做法，换个说法试试')
    return { steps }
  },

  /**
   * 对话修改：拿着当前表单里的菜谱和一句修改要求，让 AI 返回改好的整道菜和一句说明。
   * 只返回不入库；没提到的地方让 AI 保持原样，前端再和改之前对比出具体改了什么。
   * history 是之前几轮对话，让「再清淡点」「刚才那个换掉」这类话有上下文。
   */
  async reviseDish(input) {
    const family = await loadFamilyDoc(familyIdOf(this.user))
    const categories = categoriesOf(family)
    const instruction = text(input && input.instruction, 300, '修改要求')
    const current = recipeFrom(categories, input.dish, '未命名')
    const history = (Array.isArray(input.history) ? input.history : [])
      .slice(-6)
      .map((m) => `${m && m.role === 'ai' ? 'AI' : '用户'}：${shortText(m && m.text, 200)}`)
      .filter((line) => line.length > 3)
    const system =
      '你是家常菜谱助手。用户给出当前这道菜的 JSON 和一句修改要求，按要求修改后，输出 JSON：' +
      '{"reply": 一句话说明改了什么（中文，不超过 40 字）, "dish": 修改后完整的菜谱}，不要输出其他文字。' +
      'dish 的' +
      RECIPE_FIELDS +
      '用户没提到的地方保持原样，不要擅自改动；要求和这道菜无关或做不到时，dish 原样返回，reply 里说明原因。' +
      `分类：${categoryHint(categories)}`
    const user =
      (history.length ? `之前的对话：\n${history.join('\n')}\n\n` : '') +
      `当前菜谱：${JSON.stringify(current)}\n修改要求：${instruction}`
    const out = await askJson(this.config, system, user, family.aiSettings?.text)
    const dish = recipeFrom(categories, out && out.dish, current.name)
    if (!dish) throw fail('AI 没给出修改结果，换个说法试试')
    return { reply: shortText(out.reply, 80) || '改好了', dish }
  },

  /**
   * 给菜生成一张配图并存进云存储，只返回 fileID 不改菜品；前端预览后随「保存」写进 photo。
   * 用户没保存的话这张图会留在云存储里，数量有限，暂不清理。
   */
  async generateDishImage(input) {
    const familyId = familyIdOf(this.user)
    const family = await loadFamilyDoc(familyId)
    const name = text(input && input.name, 30, '菜名')
    const main = names(input && input.ingredients, 5, 20)
    // 只写画面里看得见的东西；摄影术语（景深、机位、热气）小模型会照字面乱画，所以不写
    const prompt =
      `一盘中国家常菜「${name}」，真实的美食照片${main.length ? `，用到${main.join('、')}` : ''}。` +
      '白色瓷盘装着，居中，放在原木桌面上，自然光，色泽诱人。'
    return generateImage(this.config, prompt, `dish/ai/${familyId}`, family.aiSettings?.image)
  },

  async getAiSettings() {
    return aiSettingsOf(this.config, await loadFamilyDoc(familyIdOf(this.user)))
  },

  /** 保存家庭的 AI 服务商选择，全家共用；只能选已经配好 Key 的 */
  async setAiSettings(input) {
    const familyId = familyIdOf(this.user)
    const ready = aiOptions(this.config)
      .filter((o) => o.ready)
      .map((o) => o.id)
    const pick = (value, label) => {
      if (!ready.includes(value)) throw fail(`${label}选的服务商还没配置，请先在云端 config.json 填 apiKey`)
      return value
    }
    const settings = {
      text: pick(input && input.text, '菜谱文字'),
      image: pick(input && input.image, '菜品图片'),
    }
    await families.doc(familyId).update({ aiSettings: dbCmd.set(settings) })
    return aiSettingsOf(this.config, { aiSettings: settings })
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
      subCategory: dbCmd.remove(),
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
    const { cooked, ratings, photo } = servedInput(slot, input)
    const servedAt = Date.now()
    await menus.doc(slot._id).update({
      status: 'served',
      cooked,
      ratings: dbCmd.set(ratings),
      photo,
      servedAt,
    })
    await dishes
      .where({ _id: dbCmd.in(cooked), familyId })
      .update({ timesEaten: dbCmd.inc(1), lastEatenAt: servedAt })
  },

  /**
   * 重新编辑已开饭的一顿：改做了哪些菜、评分和整桌照。
   * 菜的「做过几次」按新增、去掉的菜加减，「最近一次」按剩下的记录重算。
   */
  async updateServed(date, meal, input) {
    const familyId = familyIdOf(this.user)
    const slot = await loadSlot(familyId, date, meal)
    if (slot.status !== 'served') throw fail('这顿还没有记下，不能编辑')
    const { cooked, ratings, photo } = servedInput(slot, input)
    const before = slot.cooked || []
    const added = cooked.filter((id) => !before.includes(id))
    const removed = before.filter((id) => !cooked.includes(id))
    await menus.doc(slot._id).update({ cooked, ratings: dbCmd.set(ratings), photo })
    await adjustEaten(familyId, added, 1)
    await adjustEaten(familyId, removed, -1)
    for (const id of [...added, ...removed]) await refreshLastEaten(familyId, id)
  },

  /**
   * 删除已开饭的一条记录：这顿回到「已确认」（点过的菜还在，可以再记一次），
   * 之前记上的「做过几次」退回，「最近一次」按剩下的记录重算。
   */
  async deleteServed(date, meal) {
    const familyId = familyIdOf(this.user)
    const slot = await loadSlot(familyId, date, meal)
    if (slot.status !== 'served') throw fail('这顿还没有记下')
    const before = slot.cooked || []
    await menus.doc(slot._id).update({
      status: 'confirmed',
      cooked: dbCmd.remove(),
      ratings: dbCmd.remove(),
      photo: dbCmd.remove(),
      servedAt: dbCmd.remove(),
    })
    await adjustEaten(familyId, before, -1)
    for (const id of before) await refreshLastEaten(familyId, id)
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
