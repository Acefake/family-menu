const { test } = require('node:test')
const assert = require('node:assert/strict')
const { feedingMethods, parseLog } = require('./feeding')

function fixture() {
  const records = new Map()
  let version = 0
  const collection = (state) => ({
    doc: (id) => ({
      get: async () => ({ data: state.has(id) ? [structuredClone(state.get(id))] : [] }),
      update: async (patch) => state.set(id, { ...state.get(id), ...structuredClone(patch) }),
    }),
    add: async (doc) => {
      if (state.has(doc._id)) throw new Error('duplicate')
      state.set(doc._id, structuredClone(doc))
    },
  })
  const db = {
    collection: () => collection(records),
    startTransaction: async () => {
      const snapshot = structuredClone(records)
      const start = version
      return {
        collection: () => ({
          ...collection(snapshot),
          doc: (id) => ({
            ...collection(snapshot).doc(id),
            get: async () => ({ data: snapshot.has(id) ? structuredClone(snapshot.get(id)) : null }),
          }),
        }),
        commit: async () => {
          if (start !== version) throw new Error('conflict')
          version++
          records.clear()
          for (const [key, value] of snapshot) records.set(key, value)
        },
        rollback: async () => {},
      }
    },
  }
  const methods = feedingMethods(db)
  const call = (family, method, ...args) => methods[method].call({ user: { familyId: family } }, ...args)
  return { call, records }
}
const log = (date, extra = {}) => ({
  date,
  amount: 2,
  first: true,
  normal: true,
  symptoms: [],
  actions: [],
  note: '',
  ...extra,
})
const input = { name: '土豆', days: 3, startDate: '2026-01-01' }

test('暂停和医生确认后的已有打卡可编辑，但不能新增或解除原分类', async () => {
  const { call } = fixture()
  const id = await call('a', 'createFeeding', input)
  await call('a', 'saveFeedingLog', id, log('2026-01-01'))
  for (const status of ['pending', 'confirmed']) {
    await call('a', 'setFeedingStatus', id, status, '医生确认信息')
    await call('a', 'saveFeedingLog', id, log('2026-01-01', { amount: 8 }))
    const food = (await call('a', 'listFeeding'))[0]
    assert.equal(food.logs[0].amount, 8)
    assert.equal(food.status, status)
    await assert.rejects(call('a', 'saveFeedingLog', id, log('2026-01-02')))
  }
})

test('删除记录重新计算进度，保留家庭隔离与医生确认，不启动第二种观察', async () => {
  const { call } = fixture()
  const id = await call('a', 'createFeeding', input)
  for (const date of ['2026-01-01', '2026-01-02', '2026-01-03'])
    await call('a', 'saveFeedingLog', id, log(date))
  await call('a', 'createFeeding', { ...input, name: '南瓜' })
  await assert.rejects(call('b', 'deleteFeedingLog', id, '2026-01-01'))
  await call('a', 'deleteFeedingLog', id, '2026-01-01')
  let foods = await call('a', 'listFeeding')
  assert.equal(foods.find((f) => f.id === id).status, 'pending')
  assert.equal(foods.filter((f) => f.status === 'observing').length, 1)
  await call('a', 'setFeedingStatus', id, 'confirmed', '医院确认')
  await call('a', 'deleteFeedingLog', id, '2026-01-02')
  foods = await call('a', 'listFeeding')
  assert.equal(foods.find((f) => f.id === id).status, 'confirmed')
  assert.equal(foods.find((f) => f.id === id).logs.length, 1)
  await call('a', 'deleteFeedingLog', id, '2026-01-02')
  assert.equal((await call('a', 'listFeeding')).find((f) => f.id === id).logs.length, 1)
})

test('每天一次打卡，重复保存覆盖；完成实际观察天数后归入无异常', async () => {
  const { call } = fixture()
  const id = await call('a', 'createFeeding', input)
  await call('a', 'saveFeedingLog', id, log('2026-01-01'))
  await call('a', 'saveFeedingLog', id, log('2026-01-01', { amount: 5 }))
  let foods = await call('a', 'listFeeding')
  assert.equal(foods[0].logs.length, 1)
  assert.equal(foods[0].logs[0].amount, 5)
  assert.equal(foods[0].status, 'observing')
  await call('a', 'saveFeedingLog', id, log('2026-01-02'))
  await call('a', 'saveFeedingLog', id, log('2026-01-03'))
  foods = await call('a', 'listFeeding')
  assert.equal(foods[0].status, 'safe')
})

test('异常暂停，禁止继续试吃；医生确认需记录依据', async () => {
  const { call } = fixture()
  const id = await call('a', 'createFeeding', input)
  await call(
    'a',
    'saveFeedingLog',
    id,
    log('2026-01-01', {
      normal: false,
      symptoms: ['face'],
      time: '12:30',
      description: '脸部红疹',
      actions: ['pause'],
    })
  )
  assert.equal((await call('a', 'listFeeding'))[0].status, 'pending')
  await assert.rejects(call('a', 'saveFeedingLog', id, log('2026-01-02')))
  await assert.rejects(call('a', 'setFeedingStatus', id, 'confirmed'))
  await call('a', 'setFeedingStatus', id, 'confirmed', '2026-01-02 儿科医生确认')
  assert.equal((await call('a', 'listFeeding'))[0].status, 'confirmed')
})

test('家庭隔离、未加入家庭、并行创建只允许一种观察食物', async () => {
  const { call } = fixture()
  await assert.rejects(call('', 'listFeeding'))
  const results = await Promise.allSettled([
    call('a', 'createFeeding', input),
    call('a', 'createFeeding', { ...input, name: '南瓜' }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const id = (await call('a', 'listFeeding'))[0].id
  assert.deepEqual(await call('b', 'listFeeding'), [])
  await assert.rejects(call('b', 'saveFeedingLog', id, log('2026-01-01')))
  await assert.rejects(call('b', 'setFeedingStatus', id, 'pending'))
  await assert.rejects(call('a', 'createFeeding', { ...input, name: '南瓜' }))
})

test('边界拒绝无效日期、未来、量、矛盾选项、缺失异常信息', () => {
  for (const value of [
    log('2026-02-30'),
    log('2999-01-01'),
    log('2025-01-01'),
    log('2026-01-01', { amount: NaN }),
    log('2026-01-01', { amount: -1 }),
    log('2026-01-01', { symptoms: ['face'] }),
    log('2026-01-01', { normal: false }),
    log('2026-01-01', { normal: false, symptoms: ['face'], time: '25:00', description: '红疹' }),
  ]) {
    assert.throws(() => parseLog(value, input.startDate))
  }
})

test('并发不同日期保存遇到冲突不静默丢失数据，重试后两条保留', async () => {
  const { call } = fixture()
  const id = await call('a', 'createFeeding', input)
  const results = await Promise.allSettled([
    call('a', 'saveFeedingLog', id, log('2026-01-01')),
    call('a', 'saveFeedingLog', id, log('2026-01-02')),
  ])
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
  await call('a', 'saveFeedingLog', id, log('2026-01-01'))
  await call('a', 'saveFeedingLog', id, log('2026-01-02'))
  assert.equal((await call('a', 'listFeeding'))[0].logs.length, 2)
})

test('漏记日期不算连续完成，补齐后才完成观察', async () => {
  const { call } = fixture()
  const id = await call('a', 'createFeeding', input)
  for (const date of ['2026-01-01', '2026-01-03', '2026-01-04'])
    await call('a', 'saveFeedingLog', id, log(date))
  assert.equal((await call('a', 'listFeeding'))[0].status, 'observing')
  await call('a', 'saveFeedingLog', id, log('2026-01-02'))
  assert.equal((await call('a', 'listFeeding'))[0].status, 'safe')
})
