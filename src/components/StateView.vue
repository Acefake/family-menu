<template>
  <view v-if="loading" class="loading">
    <image class="loading-art" src="/static/illus/bowl.svg" mode="aspectFit" />
    <view class="loading-text">
      <text>正在准备</text>
      <text class="dot d1">.</text>
      <text class="dot d2">.</text>
      <text class="dot d3">.</text>
    </view>
  </view>
  <view v-else-if="error" class="state">
    <view>{{ error }}</view>
    <wd-button size="small" plain custom-style="margin-top: 12px" @click="emit('retry')">重试</wd-button>
  </view>
  <slot v-else />
</template>

<script setup lang="ts">
// 小程序里组件外会多一层自定义元素，不去掉的话根节点的 flex: 1 撑不开高度
defineOptions({ options: { virtualHost: true } })

/** 页面等数据时显示插画 loading（一只会浮动的小碗），出错时显示文字和重试，其余显示内容 */
defineProps<{ loading: boolean; error: string }>()

const emit = defineEmits<{ retry: [] }>()
</script>

<style lang="scss" scoped>
.loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  padding: 56px 0 var(--space-5);
}

.loading-art {
  width: 150px;
  height: 112px;
  animation: float 1.6s ease-in-out infinite;
}

.loading-text {
  color: var(--c-text-2);
  font-size: 14px;
}

.dot {
  animation: blink 1.2s infinite both;
}

.d2 {
  animation-delay: 0.2s;
}

.d3 {
  animation-delay: 0.4s;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-8px);
  }
}

@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.2;
  }

  40% {
    opacity: 1;
  }
}
</style>
