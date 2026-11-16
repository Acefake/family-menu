<template>
  <view v-if="loading" class="state">加载中…</view>
  <view v-else-if="error" class="state">
    <view>{{ error }}</view>
    <wd-button size="small" plain custom-style="margin-top: 12px" @click="emit('retry')">重试</wd-button>
  </view>
  <slot v-else />
</template>

<script setup lang="ts">
// 小程序里组件外会多一层自定义元素，不去掉的话根节点的 flex: 1 撑不开高度
defineOptions({ options: { virtualHost: true } })

defineProps<{ loading: boolean; error: string }>()

const emit = defineEmits<{ retry: [] }>()
</script>
