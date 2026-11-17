'use strict'

const { randomUUID } = require('crypto')
const SYMPTOMS = ['face', 'body', 'swelling', 'itch', 'vomit', 'diarrhea', 'blood', 'breathing']
const ACTIONS = ['pause', 'doctor', 'care']

function invalid(message) {
  return Object.assign(new Error(message), { errCode: 'INVALID_PARAM', errMsg: message })
}

function date(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw invalid('日期无效')
  const chinaToday = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  if (value > chinaToday) throw invalid('不能记录未来日期')
  return value
}

/** 按已排序记录计算连续无异常天数，漏记日期中断连续观察。 */
function observedDays(logs) {
  let longest = 0
  let streak = 0
  let previous = 0
  for (const log of logs) {
    const current = Date.parse(`${log.date}T00:00:00Z`)
    streak = log.normal ? (current - previous === 86400000 ? streak + 1 : 1) : 0
    longest = Math.max(longest, streak)
    previous = current
  }
  return longest
}

function string(value, max) {
  if (typeof value !== 'string' || value.length > max) throw invalid('文字内容无效或过长')
  return value.trim()
}

/** 修订历史后保留暂停/医生确认，进度不足时避免同时开启第二种观察。 */
function refreshStatus(food, foods) {
  if (food.status === 'confirmed' || food.status === 'pending') return
  if (food.logs.some((log) => !log.normal)) {
    food.status = 'pending'
    return
  }
  if (observedDays(food.logs) >= food.days) {
    food.status = 'safe'
    return
  }
  food.status = foods.some((other) => other.id !== food.id && other.status === 'observing')
    ? 'pending'
    : 'observing'
}

/** 解析打卡边界数据，正常与症状互斥，异常必须有发生时间和描述。 */
function parseLog(input, startDate) {
  if (!input || typeof input !== 'object') throw invalid('打卡内容无效')
  const day = date(input.date)
  if (day < startDate) throw invalid('日期不能早于添加日期')
  if (
    typeof input.amount !== 'number' ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > 1000
  )
    throw invalid('食用量应大于0且不超过1000 g')
  if (typeof input.first !== 'boolean' || typeof input.normal !== 'boolean')
    throw invalid('请选择首次食用与观察结果')
  if (!Array.isArray(input.symptoms) || input.symptoms.some((s) => !SYMPTOMS.includes(s)))
    throw invalid('症状选项无效')
  const symptoms = [...new Set(input.symptoms)]
  if (input.normal === Boolean(symptoms.length)) throw invalid('无异常与症状不能同时选择，也不能都不选')
  const time = string(input.time || '', 5)
  const description = string(input.description || '', 500)
  if (!input.normal && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !description))
    throw invalid('请填写异常发生时间与症状描述')
  if (!Array.isArray(input.actions) || input.actions.some((a) => !ACTIONS.includes(a)))
    throw invalid('处理方式无效')
  return {
    date: day,
    amount: input.amount,
    first: input.first,
    normal: input.normal,
    symptoms,
    time: input.normal ? '' : time,
    description: input.normal ? '' : description,
    actions: input.normal ? [] : [...new Set(input.actions)],
    note: string(input.note || '', 500),
  }
}

/** 注入现有鉴权云对象；同一家庭状态在事务中修改，避免并发丢失打卡。 */
function feedingMethods(db) {
  const familyId = (user) => {
    if (!user?.familyId) throw invalid('请先创建或加入家庭')
    return user.familyId
  }
  async function mutate(user, change) {
    const id = familyId(user)
    const transaction = await db.startTransaction()
    try {
      const collection = transaction.collection('fm-feeding')
      const { data } = await collection.doc(id).get()
      const foods = data?.foods || []
      const result = change(foods)
      if (data) await collection.doc(id).update({ foods })
      else await collection.add({ _id: id, familyId: id, foods })
      await transaction.commit()
      return result
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
  return {
    async listFeeding() {
      const { data } = await db.collection('fm-feeding').doc(familyId(this.user)).get()
      return data[0]?.foods || []
    },
    async createFeeding(input) {
      if (!input || typeof input !== 'object') throw invalid('食物内容无效')
      const name = string(input.name, 30)
      if (!name || ![3, 4, 5].includes(input.days)) throw invalid('请填写食物名称与3至5天观察周期')
      const startDate = date(input.startDate)
      return mutate(this.user, (foods) => {
        if (foods.some((f) => f.status === 'observing')) throw invalid('请先完成或暂停当前食物的观察')
        if (foods.some((f) => f.name === name)) throw invalid('该食物已有档案，请在档案中查看')
        if (foods.length >= 100) throw invalid('食物档案已达100种上限，请先导出记录')
        const food = {
          id: randomUUID(),
          name,
          startDate,
          days: input.days,
          status: 'observing',
          logs: [],
          medicalNote: '',
        }
        foods.unshift(food)
        return food.id
      })
    },
    async saveFeedingLog(id, input) {
      return mutate(this.user, (foods) => {
        const food = foods.find((f) => f.id === id)
        if (!food) throw invalid('食物记录不存在')
        if (
          (food.status === 'confirmed' || food.status === 'pending') &&
          !food.logs.some((log) => log.date === input?.date)
        )
          throw invalid('已暂停的食物不能继续试吃，请先咨询医生')
        const log = parseLog(input, food.startDate)
        const logs = food.logs.filter((entry) => entry.date !== log.date)
        if (logs.length >= 60) throw invalid('单个食物最多记录60天')
        food.logs = [...logs, log].sort((a, b) => a.date.localeCompare(b.date))
        refreshStatus(food, foods)
      })
    },
    async deleteFeedingLog(id, day) {
      date(day)
      return mutate(this.user, (foods) => {
        const food = foods.find((entry) => entry.id === id)
        if (!food) throw invalid('食物记录不存在')
        food.logs = food.logs.filter((log) => log.date !== day)
        refreshStatus(food, foods)
      })
    },
    async setFeedingStatus(id, status, note = '') {
      if (!['pending', 'confirmed'].includes(status)) throw invalid('档案分类无效')
      const medicalNote = string(note, 500)
      if (status === 'confirmed' && !medicalNote) throw invalid('请记录医生确认信息')
      return mutate(this.user, (foods) => {
        const food = foods.find((f) => f.id === id)
        if (!food) throw invalid('食物记录不存在')
        food.status = status
        food.medicalNote = medicalNote
      })
    },
  }
}

module.exports = { feedingMethods, parseLog }
