<template>
  <view class="empty">
    <image class="art" :src="`/static/illus/${art}.svg`" mode="aspectFit" />
    <view class="title">{{ title }}</view>
    <view v-if="desc" class="muted desc">{{ desc }}</view>
    <slot />
  </view>
</template>

<script setup lang="ts">
defineProps<{
  /** static/illus 里的插图名 */
  art: 'bowl' | 'basket' | 'diary' | 'family' | 'house'
  title: string
  desc?: string
}>()
</script>

<style lang="scss" scoped>
.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-5) var(--space-4);
  text-align: center;
}

.art {
  width: 176px;
  height: 132px;
  margin-bottom: var(--space-2);
}

.title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.desc {
  max-width: 260px;
}
</style>
