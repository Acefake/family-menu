import { onShow } from '@dcloudio/uni-app'

interface TabBarInstance {
  setData: (data: Record<string, unknown>) => void
}

interface TabBarHost {
  getTabBar?: () => TabBarInstance | undefined
}

function currentTabBar(): TabBarInstance | undefined {
  const pages = getCurrentPages() as unknown as TabBarHost[]
  return pages[pages.length - 1]?.getTabBar?.()
}

/** tab 页每次显示时，告诉自定义 tab 栏（src/custom-tab-bar）当前高亮第几项 */
export function useTabBar(index: number): void {
  onShow(() => currentTabBar()?.setData({ selected: index }))
}

/** 自定义 tab 栏没有原生角标，这里设置某一项的角标；空字符串表示清除 */
export function setTabBadge(index: number, text: string): void {
  currentTabBar()?.setData({ [`badges[${index}]`]: text })
}
