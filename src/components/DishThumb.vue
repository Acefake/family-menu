<template>
  <view class="thumb" :style="{ width: sizePx, height: sizePx, background: tint }">
    <image v-if="photoUrl" class="thumb-img" :src="photoUrl" mode="aspectFill" />
    <text v-if="!photoUrl" class="thumb-text">{{ name.slice(0, 1) }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { usePhotoUrl } from '@/utils/photo'

const props = withDefaults(defineProps<{ name: string; photo?: string; size?: number }>(), {
  photo: '',
  size: 60,
})

const TINTS = ['#F6D9C8', '#F3E1B8', '#D9E8CF', '#E8DCCF', '#F2CFC4', '#F5E6C4']

const photoUrl = usePhotoUrl(() => props.photo)
const sizePx = computed(() => `${props.size}px`)

/** 没有照片时按菜名取一个固定的暖色底 */
const tint = computed(() => {
  let h = 0
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
})
</script>

<style lang="scss" scoped>
.thumb {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

.thumb-img {
  width: 100%;
  height: 100%;
}

.thumb-text {
  color: rgba(43, 36, 32, 0.45);
  font-size: 22px;
  font-weight: 700;
}
</style>
