import { menuCo } from '@/api/menu'

/** 删除当天打卡，最后一条删除后同步移除食物档案。失败交由页面提示。 */
export async function deleteFeedingRecord(id: string, name: string, date: string): Promise<boolean> {
  const { confirm } = await uni.showModal({
    title: '删除这条记录？',
    content: `将删除「${name}」${date} 的打卡；如果这是最后一条记录，对应食物档案也会删除。删除后无法恢复。`,
    confirmText: '删除',
    confirmColor: '#9a5145',
  })
  if (!confirm) return false
  await menuCo().deleteFeedingLog(id, date)
  return true
}
