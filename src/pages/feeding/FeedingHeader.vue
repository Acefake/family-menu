<template>
  <view :class="['feeding-header', { compact }]" :style="{ paddingTop: `${top}px` }">
    <view class="nav-row"
      ><button class="back" aria-label="返回" @click="back"><wd-icon name="arrow-left" size="22px" /></button
      ><text v-if="compact" class="nav-title">{{ title }}</text></view
    >
    <template v-if="!compact">
      <image class="header-art" src="/static/illus/hero-bowl.svg" mode="aspectFit" />
      <view v-if="title === '辅食观察'" class="header-kicker">家庭菜单 · 宝宝的饮食记录</view>
      <view class="hero-title">{{ title }}</view>
      <view class="header-sub">{{ subtitle }}</view>
    </template>
  </view>
</template>

<script setup lang="ts">
/* global getCurrentPages */
/** 辅食模块导航，保留微信原生胶囊的安全区域。 */
defineProps<{ title: string; subtitle?: string; compact?: boolean }>()
const top = uni.getWindowInfo().statusBarHeight ?? 0
function back(): void {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/mine/index' })
}
</script>

<style scoped lang="scss">
.feeding-header {
  position: relative;
  overflow: hidden;
  padding-bottom: 20px;
  color: white;
  background: #304d60;
}
.nav-row {
  position: relative;
  display: flex;
  align-items: center;
  height: 44px;
}
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  margin: 0;
  color: inherit;
  background: transparent;
  border: 0;
}
.back::after {
  border: 0;
}
.nav-title {
  position: absolute;
  right: 80px;
  left: 80px;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}
.hero-title {
  position: relative;
  margin: 4px 16px 2px;
  font-family: var(--font-serif);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 3px;
}
.header-kicker,
.header-sub {
  position: relative;
  margin: 0 16px;
  font-size: 13px;
  color: #edf2f4;
}
.header-art {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 96px;
  height: 72px;
  opacity: 0.6;
}
.compact {
  padding-bottom: 0;
  color: var(--c-text);
  background: var(--c-bg);
}
</style>
