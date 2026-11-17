/** 家庭共享的辅食观察记录；分类仅描述已有记录，不作医学诊断。 */
export interface FeedingFood {
  id: string
  name: string
  startDate: string
  days: number
  status: 'observing' | 'safe' | 'pending' | 'confirmed'
  logs: FeedingLog[]
  medicalNote: string
}

/** 每个食物每天一条，重复保存替换当日记录。 */
export interface FeedingLog {
  date: string
  amount: number
  first: boolean
  normal: boolean
  symptoms: string[]
  time: string
  description: string
  actions: string[]
  note: string
}

/** 与云端校验使用同一组症状标识。 */
export const symptoms = [
  { id: 'face', label: '嘴周 / 脸部红疹' },
  { id: 'body', label: '身上 / 四肢起疹' },
  { id: 'swelling', label: '嘴唇 / 眼皮肿胀' },
  { id: 'itch', label: '发痒 / 烦躁哭闹' },
  { id: 'vomit', label: '呕吐 / 反胃' },
  { id: 'diarrhea', label: '腹泻 / 黏液便' },
  { id: 'blood', label: '便中带血' },
  { id: 'breathing', label: '咳嗽 / 喘息' },
]

/** 可复选的异常处理记录。 */
export const actions = [
  { id: 'pause', label: '暂停食物' },
  { id: 'doctor', label: '就医' },
  { id: 'care', label: '居家护理' },
]

/** 当前待完成的打卡序号，不把漏记日期算作已观察。 */
export function observationDay(food: FeedingFood): number {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return Math.min(observedDays(food) + (food.logs.some((l) => l.date === today) ? 0 : 1), food.days)
}

/** 连续无异常日期的最长记录，缺失日期会中断连续观察。 */
export function observedDays(food: FeedingFood): number {
  let longest = 0
  let streak = 0
  let previous = 0
  for (const log of food.logs) {
    const current = Date.parse(`${log.date}T00:00:00Z`)
    streak = log.normal ? (current - previous === 86400000 ? streak + 1 : 1) : 0
    longest = Math.max(longest, streak)
    previous = current
  }
  return longest
}

/** 将完整家庭档案转为可复制分享的文本，不丢弃异常详情。 */
export function exportFeeding(foods: FeedingFood[]): string {
  return foods
    .map((food) => {
      const label = { observing: '观察中', safe: '吃过无异常', pending: '待观察', confirmed: '医生确认过敏' }[
        food.status
      ]
      const rows = food.logs.map((log) =>
        [
          log.date,
          `${log.amount} g`,
          log.first ? '首次' : '非首次',
          log.normal
            ? '暂无异常'
            : symptoms
                .filter((s) => log.symptoms.includes(s.id))
                .map((s) => s.label)
                .join('、'),
          log.time,
          log.description,
          actions
            .filter((a) => log.actions.includes(a.id))
            .map((a) => a.label)
            .join('、'),
          log.note,
        ]
          .filter(Boolean)
          .join(' | ')
      )
      return [
        `${food.name} · ${label} · ${food.startDate}开始 · ${food.days}天观察`,
        ...rows,
        food.medicalNote,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}
