<template>
  <view class="avatar-mask" @click="close" @touchmove.stop.prevent>
    <view
      class="avatar-picker"
      role="dialog"
      aria-modal="true"
      aria-label="选择头像"
      @click.stop
      @touchmove.stop
    >
      <view class="picker-title">我的头像</view>
      <view class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="{ active: mode === tab.id }"
          :disabled="busy"
          @click="mode = tab.id"
        >
          {{ tab.label }}
        </button>
      </view>
      <scroll-view scroll-y enhanced :show-scrollbar="false" class="avatar-scroll">
        <template v-if="mode === 'builtin'">
          <view class="avatar-grid">
            <button
              v-for="item in AVATARS"
              :key="item.id"
              class="avatar-option"
              :class="{ selected: selectedAvatar === item.id }"
              :disabled="busy"
              :aria-label="item.label"
              @click="selectedAvatar = item.id"
            >
              <image :src="item.src" mode="aspectFill" class="portrait" />
            </button>
          </view>
          <button
            class="default-avatar"
            :class="{ selected: selectedAvatar === '' }"
            :disabled="busy"
            @click="selectedAvatar = ''"
          >
            按称呼自动匹配
          </button>
        </template>
        <template v-else>
          <view class="ai-preview">
            <AvatarPortrait
              v-if="generated"
              :src="generated"
              :size="200"
              fallback="头像暂不可用"
              class="generated"
            />
            <view v-else class="ai-placeholder">{{
              generating ? '正在画你的头像…' : '描述一下你想要的头像'
            }}</view>
          </view>
          <textarea
            v-model="description"
            class="description"
            :disabled="busy"
            maxlength="300"
            placeholder="比如：短发、圆脸、戴眼镜的小女孩，穿绿色毛衣"
          />
          <button
            class="btn plain generate"
            :disabled="busy || !description.trim()"
            :loading="generating"
            @click="generate"
          >
            {{ generated ? '重新生成' : '生成头像' }}
          </button>
          <text class="hint">沿用家庭设置中的 AI 图片服务，生成后满意再保存。</text>
        </template>
      </scroll-view>
      <view class="picker-actions">
        <button class="btn plain" :disabled="busy" @click="close">取消</button>
        <button class="btn" :loading="saving" :disabled="busy || (mode === 'ai' && !generated)" @click="save">
          保存头像
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage, menuCo } from '@/api/menu'
import type { Family, Member } from '@/types/models'
import { AVATARS } from './avatars'
import AvatarPortrait from './AvatarPortrait.vue'

const props = defineProps<{ /** 当前用户的已保存头像。 */ member?: Member }>()
const emit = defineEmits<{
  /** 关闭不保存的草稿。 */ (e: 'close'): void
  /** 保存成功后的家庭回包。 */ (e: 'saved', family: Family): void
}>()
type Mode = 'builtin' | 'ai'
const tabs: { id: Mode; label: string }[] = [
  { id: 'builtin', label: '内置头像' },
  { id: 'ai', label: 'AI 生成' },
]
const mode = ref<Mode>(props.member?.avatarImage ? 'ai' : 'builtin')
const selectedAvatar = ref(AVATARS.find((a) => a.id === props.member?.avatarId)?.id ?? '')
const generated = ref(props.member?.avatarImage ?? '')
const description = ref('')
const saving = ref(false)
const generating = ref(false)
const busy = computed(() => saving.value || generating.value)

function close(): void {
  if (!busy.value) emit('close')
}
async function generate(): Promise<void> {
  if (busy.value || !description.value.trim()) return
  generating.value = true
  try {
    generated.value = await menuCo().generateAvatar(description.value.trim())
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    generating.value = false
  }
}

async function save(): Promise<void> {
  if (busy.value) return
  saving.value = true
  try {
    let family: Family
    if (mode.value === 'ai') {
      if (!generated.value) return
      family = await menuCo().useGeneratedAvatar(generated.value)
    } else family = await menuCo().setAvatar(selectedAvatar.value)
    emit('saved', family)
    uni.showToast({ title: '头像已保存', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.avatar-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(36, 54, 63, 0.38);
}
.avatar-picker {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px);
  width: 100%;
  max-width: 420px;
  padding: var(--space-4);
  background: var(--c-surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 36px rgba(36, 54, 63, 0.18);
}
.picker-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 12px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.tabs button {
  flex: 1;
  padding: 0;
  font-size: 13px;
  line-height: 36px;
  color: var(--c-text-2);
  background: var(--c-bg);
}
.tabs .active {
  color: var(--c-accent);
  background: var(--c-accent-soft);
  font-weight: 600;
}
.avatar-scroll {
  height: 48vh;
  min-height: 0;
  scrollbar-width: none;
}
.picker-title,
.tabs,
.picker-actions {
  flex-shrink: 0;
}
.avatar-scroll ::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.avatar-option {
  margin: 0;
  padding: 10px 2px;
  background: var(--c-bg);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
}
button::after {
  border: 0;
}
.portrait {
  display: block;
  width: 52px;
  height: 52px;
  margin: auto;
  border-radius: 50%;
}
.selected {
  border-color: var(--c-accent) !important;
  background: var(--c-accent-soft) !important;
}
.default-avatar {
  margin: 12px 0;
  font-size: 13px;
  color: var(--c-accent);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
}
.picker-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.picker-actions .btn {
  flex: 1;
  margin: 0;
  padding: 0;
}
.ai-preview {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}
.generated,
.ai-placeholder {
  width: 200px;
  height: 200px;
  border-radius: 16px;
  background: var(--c-bg);
}
.ai-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--c-text-2);
}
.description {
  box-sizing: border-box;
  width: 100%;
  height: 82px;
  padding: 10px;
  border: 1px solid var(--c-line);
  border-radius: 10px;
  font-size: 14px;
}
.generate {
  margin: 12px 0 8px;
}
.hint {
  font-size: 12px;
  color: var(--c-text-2);
  line-height: 1.6;
}
</style>
