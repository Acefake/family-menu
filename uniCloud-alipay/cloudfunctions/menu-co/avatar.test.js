const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function fixture(options = {}) {
  const records = [
    { _id: 'me', familyId: 'home', nickname: '我' },
    { _id: 'other', familyId: 'home', nickname: '家人', avatarId: 'mom' },
  ]
  const updates = []
  const users = {
    doc: (id) => ({
      get: async () => ({ data: records.filter((u) => u._id === id) }),
      update: async (value) => {
        updates.push(id)
        Object.assign(
          records.find((u) => u._id === id),
          value
        )
      },
    }),
    where: ({ familyId }) => ({
      field: (fields) => ({
        get: async () => ({
          data: records
            .filter((u) => u.familyId === familyId)
            .map((u) =>
              Object.fromEntries(Object.entries(u).filter(([key]) => key === '_id' || fields[key]))
            ),
        }),
      }),
    }),
  }
  const families = { doc: () => ({ get: async () => ({ data: [{ _id: 'home', name: '家' }] }) }) }
  const context = {
    module: { exports: {} },
    require: (name) =>
      name === './feeding'
        ? require('./feeding')
        : name === 'crypto'
          ? require(name)
          : {
              generateImage: async (...args) => {
                if (options.failGeneration) throw new Error('生成失败')
                options.generationArgs = args
                return 'cloud://own/generated.png'
              },
            },
    uniCloud: {
      database: () => ({
        command: { set: (value) => value },
        collection: (name) => (name === 'fm-user' ? users : families),
      }),
    },
  }
  vm.runInNewContext(fs.readFileSync(`${__dirname}/index.obj.js`, 'utf8'), context)
  return { co: context.module.exports, user: records[0], records, updates }
}

test('保存、回读和恢复默认只影响当前用户', async () => {
  const { co, user, records, updates } = fixture()
  for (const avatarId of ['boy', 'senior-woman', '']) {
    const result = await co.setAvatar.call({ user }, avatarId)
    assert.equal(result.members.find((u) => u.uid === 'me').avatarId, avatarId)
    assert.equal(result.members.find((u) => u.uid === 'other').avatarId, 'mom')
  }
  assert.deepEqual(updates, ['me', 'me', 'me'])
  assert.equal(records[1].avatarId, 'mom')
})

test('非法 ID 和未加入家庭的请求不会写入用户资料', async () => {
  const { co, user, updates } = fixture()
  for (const value of ['https://example.com/a.png', '../mom', null, {}, 1]) {
    await assert.rejects(co.setAvatar.call({ user }, value), { errCode: 'INVALID_PARAM' })
  }
  await assert.rejects(co.setAvatar.call({ user: { _id: 'me' } }, 'boy'), { errCode: 'NO_FAMILY' })
  assert.deepEqual(updates, [])
})
const path = require('node:path')
const root = path.resolve(__dirname, '../../..')

test('AI 生成不替换头像，确认仅接受自己的生成结果', async () => {
  const options = {}
  const { co, user, records } = fixture(options)
  const result = await co.generateAvatar.call({ user, config: {} }, '戴眼镜的小女孩')
  assert.equal(user.avatarImage, undefined)
  assert.equal(user.avatarDraft, result)
  assert.equal(options.generationArgs[2], 'avatar/ai/me')
  assert.match(options.generationArgs[1], /戴眼镜的小女孩/)
  await assert.rejects(co.useGeneratedAvatar.call({ user }, 'cloud://other/avatar.png'))
  const family = await co.useGeneratedAvatar.call({ user }, result)
  assert.equal(family.members[0].avatarImage, result)
  assert.equal(records[1].avatarImage, undefined)
})

test('AI 失败或空描述不会覆盖头像和草稿', async () => {
  const { co, user, updates } = fixture({ failGeneration: true })
  await assert.rejects(co.generateAvatar.call({ user, config: {} }, '男孩'))
  await assert.rejects(co.generateAvatar.call({ user, config: {} }, ''))
  assert.deepEqual(updates, [])
})

test('所有内置头像目录与schema一致，并且图片实际存在', async () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'uniCloud-alipay/database/fm-user.schema.json')))
  const source = fs.readFileSync(path.join(root, 'src/pages/mine/avatars.ts'), 'utf8')
  const ids = [...source.matchAll(/\['([^']+)', '[^']+'\]/g)].map((m) => m[1])
  assert.equal(ids.length, 29)
  assert.deepEqual(new Set(ids), new Set(schema.properties.avatarId.enum.filter(Boolean)))
  const { co, user } = fixture()
  for (const id of ids) {
    assert.ok(fs.existsSync(path.join(root, `src/static/avatars/${id}.png`)))
    const family = await co.setAvatar.call({ user }, id)
    assert.equal(family.members[0].avatarId, id)
  }
})

test('停用搭配后保留已保存图片，选择内置头像仍可正常替换', async () => {
  const { co, user } = fixture()
  user.avatarImage = 'cloud://own/previous.png'
  assert.equal(co.saveLayerAvatar, undefined)
  let family = await co.getFamily.call({ user })
  assert.equal(family.members[0].avatarImage, user.avatarImage)
  family = await co.setAvatar.call({ user }, 'boy')
  assert.equal(family.members[0].avatarImage, '')
  assert.equal(family.members[0].avatarId, 'boy')
})
