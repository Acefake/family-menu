import { onPageScroll } from '@dcloudio/uni-app'
import { type Ref, ref } from 'vue'

/** 页面当前滚动的距离，给 NavHero 做展开 / 收起用 */
export function useScrollTop(): Ref<number> {
  const top = ref(0)
  onPageScroll((e) => {
    top.value = e.scrollTop
  })
  return top
}
