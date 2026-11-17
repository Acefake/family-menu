<template>
  <view class="avatar-portrait" :style="{ width: `${size}px`, height: `${size}px` }">
    <image v-if="url && !failed" :src="url" class="image" mode="aspectFill" @error="failed = true" />
    <text v-else>{{ fallback }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { resolvePhoto } from '@/utils/photo'

const props = withDefaults(
  defineProps<{
    /** 云存储文件 ID 或直接可显示的图片地址。 */ src: string
    /** 加载前或图片不可用时显示的文字。 */ fallback?: string
    /** 头像边长；组件内部设置尺寸，避免依赖跨组件的百分比布局。 */ size?: number
  }>(),
  { fallback: '家', size: 36 }
)
const url = ref('')
const failed = ref(false)

watch(
  () => props.src,
  async (src, _, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    url.value = ''
    failed.value = false
    if (!src) return
    try {
      const resolved = await resolvePhoto(src)
      if (current) url.value = resolved
    } catch {
      if (current) failed.value = true
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.avatar-portrait {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  border-radius: 50%;
}
.image {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
