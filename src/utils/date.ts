import type { Meal } from '@/types/models'

const pad = (n: number): string => String(n).padStart(2, '0')

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): string {
  return toDateString(new Date())
}

/** date 往后（或往前）数 days 天 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

export interface DayCell {
  date: string
  /** 今天 / 明天 / 周几 */
  label: string
  /** 几号 */
  day: number
}

/** 从 start 起连续 count 天，日期条用 */
export function dayStrip(start: string, count: number): DayCell[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i)
    const d = new Date(`${date}T00:00:00`)
    const label = i === 0 ? '今天' : i === 1 ? '明天' : `周${'日一二三四五六'[d.getDay()]}`
    return { date, label, day: d.getDate() }
  })
}

/** 按当前时间猜下一顿：10 点前早饭，15 点前午饭，其余晚饭 */
export function currentMeal(): Meal {
  const h = new Date().getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  return 'dinner'
}

/** 今天 / 明天 / 11月17日 周二 */
export function relativeDay(date: string): string {
  const now = today()
  if (date === now) return '今天'
  if (date === addDays(now, 1)) return '明天'
  return formatDay(date)
}

export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const week = '日一二三四五六'[d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
}

/** 周几，比如「周四」 */
export function weekdayName(date: string): string {
  return `周${'日一二三四五六'[new Date(`${date}T00:00:00`).getDay()]}`
}

/** 11月17日 */
export function monthDay(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
