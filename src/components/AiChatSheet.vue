<template>
  <view v-if="visible" class="mask" @click="emit('close')" @touchmove.stop.prevent>
    <view class="sheet" @click.stop @touchmove.stop>
      <view class="grab" />
      <view class="hd">
        <text class="title">AI 助手</text>
        <text class="close" @click="emit('close')">收起</text>
      </view>

      <scroll-view scroll-y class="msgs" :scroll-top="bottom" scroll-with-animation>
        <view v-for="m in messages" :key="m.id" :class="['msg', m.role]">
          <text>{{ m.text }}</text>
          <view v-if="m.diff?.length" class="diff">
            <text v-for="(line, i) in m.diff" :key="i">{{ line }}</text>
          </view>
        </view>
        <view v-if="busy" class="msg ai"><text class="thinking">正在想…</text></view>
        <view v-if="canUndo && !busy" class="undo" @click="emit('undo')">撤销这次修改</view>
      </scroll-view>

      <scroll-view scroll-x enhanced :show-scrollbar="false" class="chips">
        <view class="chips-in">
          <text v-for="s in suggestions" :key="s" class="chip" @click="submit(s)">{{ s }}</text>
        </view>
      </scroll-view>

      <view class="inrow">
        <view class="ask">
          <image class="spark" src="/static/illus/spark.svg" mode="aspectFit" />
          <input
            v-model="draft"
            class="ask-input"
            :placeholder="placeholder"
            placeholder-style="color: #5f6e73"
            confirm-type="send"
            :maxlength="300"
            @confirm="submit(draft)"
          />
        </view>
        <view :class="['send', { off: busy || !draft.trim() }]" @click="submit(draft)">
          <wd-icon name="arrow-up" size="20px" color="#fff" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import type { ChatMessage } from '@/types/models'

/** 和 AI 对话修改菜谱的抽屉：消息列表、快捷建议、输入框；怎么改由页面决定，这里只管显示和收发 */
const props = defineProps<{
  visible: boolean
  messages: ChatMessage[]
  /** AI 正在想：显示「正在想…」，也不让再发 */
  busy: boolean
  placeholder: string
  suggestions: string[]
  /** 有可以撤销的上一次修改 */
  canUndo: boolean
}>()

const emit = defineEmits<{
  close: []
  send: [text: string]
  undo: []
}>()

const draft = ref('')

/** 每次有新消息、AI 在想、出现撤销，就把滚动位置顶到最底下；值每次都加大，小程序才会重新滚 */
const bottom = ref(0)
watch(
  () => [props.visible, props.messages.length, props.busy, props.canUndo],
  () => void nextTick(() => (bottom.value += 100000)),
  { flush: 'post' }
)

function submit(text: string): void {
  const value = text.trim()
  if (!value || props.busy) return
  draft.value = ''
  emit('send', value)
}
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 900;
  display: flex;
  align-items: flex-end;
  background: rgba(36, 54, 63, 0.38);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 100%;
  height: 62vh;
  padding: var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
  background: var(--c-surface);
  border-radius: 18px 18px 0 0;
}

.grab {
  align-self: center;
  width: 36px;
  height: 4px;
  background: var(--c-line-strong);
  border-radius: 2px;
}

.hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 700;
}

.close {
  color: var(--c-text-2);
  font-size: 13px;
}

.msgs {
  flex: 1;
  min-height: 0;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  box-sizing: border-box;
  width: fit-content;
  max-width: 84%;
  margin-bottom: var(--space-2);
  padding: 9px 13px;
  font-size: 14.5px;
  line-height: 1.55;
  border-radius: 14px;

  &.me {
    margin-left: auto;
    color: #fff;
    background: var(--c-accent);
    border-bottom-right-radius: 4px;
  }

  &.ai {
    background: var(--c-bg);
    border-bottom-left-radius: 4px;
  }
}

.diff {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--c-text-2);
  font-size: 12.5px;
}

.thinking {
  color: var(--c-text-2);
  animation: pulse 1.2s ease-in-out infinite;
}

.undo {
  display: inline-block;
  margin-bottom: var(--space-2);
  padding: 0 var(--space-1);
  color: var(--c-accent);
  font-size: 12.5px;
}

.chips {
  flex: none;
  white-space: nowrap;
}

.chips-in {
  display: inline-flex;
  gap: var(--space-2);
  white-space: nowrap;
}

.chip {
  flex: none;
  padding: 5px 12px;
  white-space: nowrap;
  color: var(--c-accent);
  font-size: 13px;
  background: var(--c-accent-soft);
  border-radius: var(--radius-pill);
}

.inrow {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.ask {
  display: flex;
  flex: 1;
  gap: var(--space-2);
  align-items: center;
  box-sizing: border-box;
  height: 44px;
  padding: 0 14px;
  background: var(--c-surface);
  border: 1px solid var(--c-accent);
  border-radius: var(--radius-pill);
}

.spark {
  flex: none;
  width: 16px;
  height: 16px;
}

.ask-input {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.send {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--c-accent);
  border-radius: 50%;

  &.off {
    opacity: 0.4;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}
</style>
