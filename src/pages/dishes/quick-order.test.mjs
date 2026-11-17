import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as Vue from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'

function fixture() {
  let load
  let fail = false
  let status = 'open'
  let selection = { uid: 'me', dishIds: ['old'], note: '少盐' }
  const calls = []
  const toasts = []
  const session = {
    family: Vue.ref(null),
    uid: Vue.ref('me'),
    date: Vue.ref('2026-11-17'),
    meal: Vue.ref('dinner'),
  }
  const co = {
    listDishes: async () => [],
    getSlot: async () => ({ status, selections: [selection] }),
    submitSelection: async (...args) => {
      calls.push(args)
      if (fail) throw new Error('保存失败')
      selection = { uid: 'me', dishIds: args[2], note: args[3] }
      return { status, selections: [selection] }
    },
  }
  const imports = {
    vue: Vue,
    pinia: { storeToRefs: (store) => store },
    '@/api/menu': { menuCo: () => co, errorMessage: (error) => error.message },
    '@/stores/session': { useSessionStore: () => session },
    '@/composables/use-page-data': {
      usePageData: (fn) => {
        load = fn
        return {}
      },
    },
    '@/composables/use-tab-bar': { useTabBar: () => {} },
    '@/types/models': { MEAL_LABEL: { dinner: '晚饭' } },
    '@/utils/date': { relativeDay: () => '今天' },
  }
  const { descriptor } = parse(fs.readFileSync(new URL('./index.vue', import.meta.url), 'utf8'))
  const code = compileScript(descriptor, { id: 'quick-order' }).content
  const module = { exports: {} }
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (id) => imports[id] || {},
      uni: { showToast: (value) => toasts.push(value) },
    }
  )
  const state = module.exports.default.setup({}, { expose: () => {} })
  return {
    state,
    calls,
    toasts,
    load: () => load(),
    setFail: () => {
      fail = true
    },
    setServed: () => {
      status = 'served'
    },
  }
}

test('快捷点菜保留已有菜和留言，更新成功后按钮选中，再点可取消', async () => {
  const f = fixture()
  await f.load()
  await f.state.quickOrder('new')
  assert.deepEqual(Array.from(f.calls[0][2]), ['old', 'new'])
  assert.equal(f.calls[0][3], '少盐')
  assert.equal(f.state.quickPicked.value.has('new'), true)
  await f.state.quickOrder('old')
  assert.deepEqual(Array.from(f.calls[1][2]), ['new'])
  assert.equal(f.state.quickPicked.value.has('old'), false)
})

test('失败保留原选择，已开饭拒绝提交', async () => {
  const f = fixture()
  await f.load()
  f.setFail()
  await f.state.quickOrder('new')
  assert.equal(f.state.quickPicked.value.has('new'), false)
  assert.equal(f.state.ordering.value, false)
  assert.equal(f.toasts.at(-1).title, '保存失败')
  f.setServed()
  await f.state.quickOrder('new')
  assert.equal(f.calls.length, 1)
})
