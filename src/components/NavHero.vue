<template>
  <view>
    <view class="nav-hero" :style="{ paddingTop: `${metrics.status}px` }">
      <image
        v-if="art"
        class="art"
        :style="{ opacity: 0.17 - progress * 0.07, transform: `scale(${1 - progress * 0.35})` }"
        :src="`/static/illus/hero-${art}.svg`"
        mode="aspectFit"
      />
      <image
        class="sparks"
        :style="{ opacity: 0.16 * (1 - progress) }"
        src="/static/illus/hero-sparks.svg"
        mode="aspectFit"
      />

      <view class="row" :style="{ height: `${metrics.row}px`, paddingRight: `${metrics.right}px` }">
        <text class="mini" :style="{ opacity: miniOpacity }">{{ title }}</text>
      </view>

      <view class="block" :style="blockStyle">
        <view class="block-in">
          <slot name="lead" />
          <view class="heading">
            <text v-if="sub" class="sub">{{ sub }}</text>
            <text class="title">{{ title }}</text>
          </view>
        </view>
      </view>

      <view class="body">
        <slot />
      </view>
      <view class="lip" />
    </view>
    <view :style="{ height: `${spacer}px` }" />
    <view v-if="refreshing" class="refresh" :style="{ top: `${headerHeight + 10}px` }">
      <image class="refresh-art" src="/static/illus/bowl.svg" mode="aspectFit" />
      <text>正在刷新…</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUpdated, ref } from 'vue'

/**
 * 蓝色页头：配合 pages.json 的 navigationStyle: custom 使用。
 * 头部延伸到状态栏，固定在顶部。页面在顶部时展开（日期 + 大标题 + 操作区），
 * 往下滑时大标题那一块跟着滚动距离收起，标题淡入到微信胶囊同一行，头部下沿始终贴着内容。
 * 展开部分的高度是量出来的，所以页面本身不用留顶部空白。
 */
const props = defineProps<{
  title: string
  /** 大标题上面的小字，比如日期 */
  sub?: string
  /** 背景里的线稿插画，static/illus/hero-*.svg */
  art?: 'bowl' | 'book' | 'basket' | 'house'
  /** 页面当前滚动的距离（px），决定展开还是收起 */
  scroll?: number
  /** 内容区自己滚动（页面本身不滚）时用：占位跟着头部一起缩，内容才能贴上来 */
  follow?: boolean
  /** 正在下拉刷新：头部下面出现一个「正在刷新」的插画胶囊 */
  refreshing?: boolean
}>()

const instance = getCurrentInstance()
/** 展开时头部的总高度、可收起的那一块（日期 + 大标题）的高度 */
const fullHeight = ref(0)
const blockHeight = ref(0)

/** 状态栏高度、标题行高度，以及要给右上角胶囊让出的宽度；读不到胶囊（H5、模拟器）就用常见值 */
function readMetrics(): { status: number; row: number; right: number } {
  const win = uni.getWindowInfo()
  const status = win.statusBarHeight ?? 0
  try {
    const capsule = uni.getMenuButtonBoundingClientRect()
    if (capsule.height > 0) {
      return {
        status,
        row: (capsule.top - status) * 2 + capsule.height,
        right: win.windowWidth - capsule.left + 8,
      }
    }
  } catch {
    // 没有胶囊的环境
  }
  return { status, row: 44, right: 16 }
}

const metrics = readMetrics()

/** 收起的进度：0 完全展开，1 完全收起 */
const progress = computed(() => {
  if (!blockHeight.value) return 0
  return Math.min(Math.max((props.scroll ?? 0) / blockHeight.value, 0), 1)
})

/** 大标题在最后 40% 的滚动里才淡入到胶囊那一行，避免和展开的标题同时出现 */
const miniOpacity = computed(() => Math.min(Math.max((progress.value - 0.6) / 0.4, 0), 1))

const blockStyle = computed(() =>
  progress.value > 0
    ? { height: `${blockHeight.value * (1 - progress.value)}px`, opacity: 1 - progress.value * 1.4 }
    : {}
)

/** 头部现在实际的高度（收起过程中会变），刷新胶囊贴在它下面 */
const headerHeight = computed(() => fullHeight.value - blockHeight.value * progress.value)

const spacer = computed(() =>
  props.follow ? fullHeight.value - blockHeight.value * progress.value : fullHeight.value
)

function measure(): void {
  // 只在完全展开时量，收起过程中量到的是缩小后的高度
  if (progress.value > 0) return
  const query = uni.createSelectorQuery().in(instance?.proxy)
  query.select('.nav-hero').boundingClientRect()
  query.select('.block').boundingClientRect()
  query.exec((rects: Array<{ height: number } | null>) => {
    const [hero, block] = rects ?? []
    if (hero?.height) fullHeight.value = hero.height
    if (block?.height) blockHeight.value = block.height
  })
}

onMounted(() => void nextTick(measure))
onUpdated(() => void nextTick(measure))
</script>

<style lang="scss" scoped>
.nav-hero {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 100;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(180deg, #4a6b7f 0%, #304d60 65%, #263f4f 100%);
}

/* 背景里的线稿：白色描边、很淡，贴在右下角，往上收起时跟着缩小 */
.art {
  position: absolute;
  right: -18px;
  bottom: 6px;
  width: 200px;
  height: 150px;
  transform-origin: right bottom;
  pointer-events: none;
}

.sparks {
  position: absolute;
  top: 14px;
  left: 170px;
  width: 60px;
  height: 40px;
  pointer-events: none;
}

.row,
.block,
.body,
.lip {
  position: relative;
}

.row {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  padding-left: var(--space-4);
}

/* 收起后出现在胶囊同一行的小标题 */
.mini {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 700;
  white-space: nowrap;
}

.block {
  overflow: hidden;
}

.block-in {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-1) var(--space-4) 0;
}

.heading {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sub {
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
}

.title {
  font-family: var(--font-serif);
  font-size: 25px;
  font-weight: 700;
  line-height: 1.35;
}

.body {
  box-sizing: border-box;
  min-height: 12px;
  padding: var(--space-3) var(--space-4) var(--space-4);
}

/* 下拉刷新时头部下面的小胶囊：小碗轻轻浮动 */
.refresh {
  position: fixed;
  left: 50%;
  z-index: 99;
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: 4px 16px 4px 10px;
  color: var(--c-text-2);
  font-size: 13px;
  background: var(--c-surface);
  border-radius: var(--radius-pill);
  box-shadow: 0 4px 12px rgba(36, 54, 63, 0.16);
  transform: translateX(-50%);
}

.refresh-art {
  width: 34px;
  height: 26px;
  animation: float 1.4s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-3px);
  }
}

/* 头部底边的白色圆角，和下面的白色内容区连成一体 */
.lip {
  height: 14px;
  background: var(--c-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
</style>
