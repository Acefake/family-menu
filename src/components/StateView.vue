<template>
  <view v-if="loading" class="state">加载中…</view>
  <view v-else-if="error" class="state">
    <view>{{ error }}</view>
    <wd-button size="small" plain custom-style="margin-top: 12px" @click="emit('retry')">重试</wd-button>
  </view>
  <slot v-else />
</template>

<script setup lang="ts">
defineProps<{ loading: boolean; error: string }>()

const emit = defineEmits<{ retry: [] }>()
</script>
