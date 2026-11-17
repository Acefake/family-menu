import type { Category, DishDraft } from '@/types/models'
import { categoryName } from '@/types/models'

const MAX_LINES = 8
const SNIPPET = 18

function snippet(text: string): string {
  return text.length > SNIPPET ? `${text.slice(0, SNIPPET)}…` : text
}

function qtyLabel(qty: string): string {
  return qty || '适量'
}

/** 标签的增减 */
function diffTags(before: string[], after: string[]): string[] {
  const lines: string[] = []
  const added = after.filter((t) => !before.includes(t))
  const removed = before.filter((t) => !after.includes(t))
  if (added.length) lines.push(`标签 + ${added.join('、')}`)
  if (removed.length) lines.push(`标签 − ${removed.join('、')}`)
  return lines
}

/** 食材：同名的看用量变没变，没有的算新增，少了的算去掉 */
function diffIngredients(before: DishDraft['ingredients'], after: DishDraft['ingredients']): string[] {
  const lines: string[] = []
  const old = new Map(before.map((i) => [i.name, i.qty]))
  const kept = new Set<string>()
  for (const item of after) {
    kept.add(item.name)
    if (!old.has(item.name)) lines.push(`食材 + ${item.name} ${qtyLabel(item.qty)}`)
    else if (old.get(item.name) !== item.qty) {
      lines.push(`${item.name} ${qtyLabel(old.get(item.name) ?? '')} → ${qtyLabel(item.qty)}`)
    }
  }
  for (const item of before) if (!kept.has(item.name)) lines.push(`食材 − ${item.name}`)
  return lines
}

/** 做法：按步骤序号对比，多出来的算新增，少了的算去掉 */
function diffSteps(before: string[], after: string[]): string[] {
  const lines: string[] = []
  const common = Math.min(before.length, after.length)
  for (let i = 0; i < common; i++) {
    if (before[i] !== after[i]) lines.push(`做法 第 ${i + 1} 步 → ${snippet(after[i])}`)
  }
  for (let i = common; i < after.length; i++) lines.push(`做法 + 第 ${i + 1} 步：${snippet(after[i])}`)
  if (before.length > after.length)
    lines.push(`做法 − 去掉第 ${after.length + 1} 步起的 ${before.length - after.length} 步`)
  return lines
}

/** AI 改之前和改之后的菜谱差别，一条一条列出来给人看；没有差别返回空数组 */
export function diffDish(before: DishDraft, after: DishDraft, categories: Category[]): string[] {
  const lines: string[] = []
  if (before.name !== after.name) lines.push(`菜名 ${before.name} → ${after.name}`)
  if (before.category !== after.category) {
    lines.push(
      `分类 ${categoryName(categories, before.category)} → ${categoryName(categories, after.category)}`
    )
  }
  const oldMinutes = before.minutes || 0
  const newMinutes = after.minutes || 0
  if (oldMinutes !== newMinutes) {
    lines.push(
      `用时 ${oldMinutes ? `${oldMinutes} 分钟` : '未填'} → ${newMinutes ? `${newMinutes} 分钟` : '未填'}`
    )
  }
  lines.push(...diffTags(before.tags, after.tags))
  lines.push(...diffIngredients(before.ingredients, after.ingredients))
  lines.push(...diffSteps(before.steps, after.steps))
  return lines.length > MAX_LINES
    ? [...lines.slice(0, MAX_LINES), `…还有 ${lines.length - MAX_LINES} 处`]
    : lines
}
