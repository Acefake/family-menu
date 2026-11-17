import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import * as Vue from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'

function evaluate(code, imports, globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    { module, exports: module.exports, require: (id) => imports[id], ...globals }
  )
  return module.exports
}

function fixture() {
  const requests = new Map()
  const photo = evaluate(
    fs.readFileSync(new URL('../../utils/photo.ts', import.meta.url), 'utf8'),
    { vue: Vue },
    {
      uniCloud: {
        getTempFileURL: ({ fileList }) =>
          new Promise((resolve, reject) => {
            requests.set(fileList[0], { resolve, reject })
          }),
      },
    }
  )
  const { descriptor } = parse(fs.readFileSync(new URL('./AvatarPortrait.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, {
    id: 'avatar-test',
    inlineTemplate: true,
    templateOptions: {
      compilerOptions: { isCustomElement: (tag) => ['view', 'image', 'text'].includes(tag) },
    },
  })
  const component = evaluate(script.content, { vue: Vue, '@/utils/photo': photo }).default
  const renderer = Vue.createRenderer({
    createElement: (tag) => ({ tag, props: {}, children: [] }),
    createText: (text) => ({ text }),
    createComment: () => ({}),
    insert: (node, parent) => {
      node.parent = parent
      parent.children.push(node)
    },
    remove: (node) => {
      node.parent.children = node.parent.children.filter((child) => child !== node)
    },
    patchProp: (node, key, _, value) => {
      node.props[key] = value
    },
    setText: (node, text) => {
      node.text = text
    },
    setElementText: (node, text) => {
      node.text = text
    },
    parentNode: (node) => node.parent,
    nextSibling: () => null,
    setScopeId: () => {},
  })
  const root = { children: [] }
  const render = (src) => renderer.render(Vue.h(component, { src, fallback: '家' }), root)
  const image = () => root.children[0].children.find((node) => node.tag === 'image')
  return { requests, render, image, root }
}

async function flush() {
  await setImmediate()
  await Vue.nextTick()
}

test('AI 云存储 ID 先解析成 HTTPS，图片组件不接收原始 cloud ID', async () => {
  const { render, requests, image } = fixture()
  render('cloud://avatar/ai/me.png')
  assert.equal(image(), undefined)
  requests
    .get('cloud://avatar/ai/me.png')
    .resolve({ fileList: [{ tempFileURL: 'https://storage.example/me.png' }] })
  await flush()
  assert.equal(image().props.src, 'https://storage.example/me.png')
})

test('内置图片地址保持不变，不请求云文件解析', async () => {
  const { render, requests, image } = fixture()
  render('/static/avatars/boy.png')
  await flush()
  assert.equal(image().props.src, '/static/avatars/boy.png')
  assert.equal(requests.size, 0)
})

test('换头像后，旧请求晚返回不会覆盖新头像', async () => {
  const { render, requests, image } = fixture()
  render('cloud://avatar/old.png')
  render('cloud://avatar/new.png')
  await Vue.nextTick()
  requests
    .get('cloud://avatar/new.png')
    .resolve({ fileList: [{ tempFileURL: 'https://storage.example/new.png' }] })
  await flush()
  requests
    .get('cloud://avatar/old.png')
    .resolve({ fileList: [{ tempFileURL: 'https://storage.example/old.png' }] })
  await flush()
  assert.equal(image().props.src, 'https://storage.example/new.png')
})

test('解析失败和图片解码失败显示占位，避免继续渲染无效图片', async () => {
  const { render, requests, image } = fixture()
  render('cloud://avatar/missing.png')
  requests.get('cloud://avatar/missing.png').reject(new Error('missing'))
  await flush()
  assert.equal(image(), undefined)
  render('/static/avatars/boy.png')
  await flush()
  image().props.onError()
  await Vue.nextTick()
  assert.equal(image(), undefined)
})
