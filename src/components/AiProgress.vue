<template>
  <view v-if="visible" class="mask" @touchmove.stop.prevent>
    <view class="card">
      <image
        class="art"
        :src="`/static/illus/${stage === 'image' ? 'painting' : 'cooking'}.svg`"
        mode="aspectFit"
      />
      <view class="title">{{ stage === 'image' ? '正在给菜画像' : '正在写菜谱' }}</view>
      <view class="muted">{{ stage === 'image' ? '画一张图大约要 10～20 秒' : 'AI 正在想食材和做法' }}</view>
      <view class="track"><view class="track-fill" /></view>
      <view v-if="withRecipe" class="steps">
        <text :class="['step', stage === 'recipe' ? 'now' : 'done']">写菜谱</text>
        <text class="arrow">→</text>
        <text :class="['step', stage === 'image' ? 'now' : '']">画菜图</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/** AI 生成时盖在页面上的进度弹窗：插画 + 不确定进度条，生成期间挡住所有操作 */
defineProps<{
  visible: boolean
  /** recipe 在写菜谱文字，image 在画菜图 */
  stage: 'recipe' | 'image'
  /** 是不是「菜谱 + 图片」一起生成；是的话底部显示两步的进度 */
  withRecipe?: boolean
}>()
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(36, 54, 63, 0.45);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  box-sizing: border-box;
  width: 280px;
  padding: var(--space-5) var(--space-4) var(--space-5);
  text-align: center;
  background: var(--c-surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(36, 54, 63, 0.18);
}

.art {
  width: 176px;
  height: 132px;
  animation: bob 1.8s ease-in-out infinite;
}

.title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.track {
  width: 100%;
  height: 6px;
  margin-top: var(--space-2);
  overflow: hidden;
  background: var(--c-accent-soft);
  border-radius: var(--radius-pill);
}

.track-fill {
  width: 40%;
  height: 100%;
  background: var(--c-accent);
  border-radius: var(--radius-pill);
  animation: slide 1.4s ease-in-out infinite;
}

.steps {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  color: var(--c-text-2);
  font-size: 13px;
}

.step {
  &.now {
    color: var(--c-accent);
    font-weight: 600;
  }

  &.done {
    color: var(--c-done);
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

@keyframes slide {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(250%);
  }
}
</style>
