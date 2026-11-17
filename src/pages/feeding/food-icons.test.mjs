import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const module = { exports: {} }
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(new URL('./food-icons.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { module, exports: module.exports }
)
const { foodIcon, foodIcons } = module.exports

test('食物名称、做法与别名匹配对应图标，避免相近名称误匹配', () => {
  for (const [name, id] of [
    ['蒸土豆泥', 'potato'],
    ['山药泥', 'yam'],
    ['胡萝卜泥', 'carrot'],
    ['白萝卜', 'radish'],
    ['鳄梨泥', 'avocado'],
    ['猕猴桃泥', 'kiwi'],
    ['小白菜', 'bok-choy'],
    ['鹌鹑蛋', 'quail-egg'],
    ['鸡蛋蛋黄泥', 'egg-yolk'],
    ['鳕鱼泥', 'cod'],
    ['小米粥', 'millet'],
    ['南瓜', 'pumpkin'],
    ['贝贝瓜', 'pumpkin'],
    ['豆腐泥', 'tofu'],
    ['未知食材', 'generic'],
    ['', 'generic'],
  ])
    assert.equal(foodIcon(name), `/pages/feeding/static/${id}.svg`, name)
})

test('目录中每一种食物及兜底图标都存在，所有图标使用统一线稿尺寸与颜色', () => {
  const ids = [...foodIcons.map((icon) => icon.id), 'generic']
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.length, 64)
  for (const id of ids) {
    const svg = fs.readFileSync(new URL(`./static/${id}.svg`, import.meta.url), 'utf8')
    assert.match(svg, /viewBox="0 0 48 48"/)
    assert.match(svg, /stroke="#626d48"/)
    assert.match(svg, /stroke-width="1.55"/)
  }
  for (const icon of foodIcons) assert.equal(foodIcon(icon.label), `/pages/feeding/static/${icon.id}.svg`)
})
