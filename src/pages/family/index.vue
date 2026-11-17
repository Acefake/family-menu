<template>
  <view class="page">
    <StateView :loading="loading" :error="error" @retry="reload">
      <view class="card section">
        <view class="setting-row hairline">
          <text class="setting-label">我的称呼</text>
          <input
            v-model="nickname"
            class="setting-input"
            placeholder="比如：妈妈"
            maxlength="12"
            @blur="saveNickname"
          />
        </view>
      </view>

      <view v-if="aiSettings" class="group">
        <view class="group-title">AI 设置</view>
        <view class="card section">
          <view class="setting-row hairline" @click="pickAi('text')">
            <text class="setting-label">菜谱文字</text>
            <text class="setting-value">{{ aiLabel('text') }}</text>
            <text class="setting-chev">›</text>
          </view>
          <view class="setting-row hairline" @click="pickAi('image')">
            <text class="setting-label">菜品图片</text>
            <text class="setting-value">{{ aiLabel('image') }}</text>
            <text class="setting-chev">›</text>
          </view>
        </view>
        <view class="muted hint">选哪一家，全家一起生效；只有云端配置了 Key 的才能选。</view>
      </view>

      <view class="card section">
        <view class="setting-row" @click="leave">
          <text class="setting-label danger">退出这个家庭</text>
        </view>
      </view>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'
import type { AiOption, AiSettings } from '@/types/models'

const session = useSessionStore()
const { family, uid } = storeToRefs(session)
const nickname = ref('')
const aiSettings = ref<AiSettings | null>(null)

const myName = computed(() => family.value?.members.find((m) => m.uid === uid.value)?.nickname ?? '家人')

const { loading, error, reload } = usePageData(async () => {
  nickname.value = myName.value
  await loadAi()
})

/** 读不到（比如云函数还没更新）不拦着整个页面，只是不显示 AI 设置 */
async function loadAi(): Promise<void> {
  try {
    aiSettings.value = await menuCo().getAiSettings()
  } catch (err) {
    console.error('getAiSettings failed', err)
    aiSettings.value = null
  }
}

function aiModel(kind: 'text' | 'image', option: AiOption): string {
  return kind === 'text' ? option.textModel : option.imageModel
}

/** 设置行右侧的文字，比如「硅基流动 · Kwai-Kolors/Kolors」 */
function aiLabel(kind: 'text' | 'image'): string {
  const current = aiSettings.value
  const option = current?.options.find((o) => o.id === current[kind])
  return option ? `${option.label} · ${aiModel(kind, option)}` : '未配置'
}

/** 弹出已配好 Key 的服务商让家里人选，选完全家都生效 */
async function pickAi(kind: 'text' | 'image'): Promise<void> {
  const current = aiSettings.value
  if (!current) return
  const ready = current.options.filter((o) => o.ready)
  if (!ready.length) {
    uni.showToast({ title: '云端还没配置 AI，先在 config.json 填 apiKey', icon: 'none' })
    return
  }
  if (ready.length === 1) {
    uni.showToast({ title: `目前只配置了${ready[0].label}`, icon: 'none' })
    return
  }
  try {
    const { tapIndex } = await uni.showActionSheet({
      itemList: ready.map((o) => `${o.label} · ${aiModel(kind, o)}${o.id === current[kind] ? '  ✓' : ''}`),
    })
    const chosen = ready[tapIndex]
    if (chosen.id === current[kind]) return
    aiSettings.value = await menuCo().setAiSettings({
      text: kind === 'text' ? chosen.id : current.text,
      image: kind === 'image' ? chosen.id : current.image,
    })
    uni.showToast({ title: `已改用${chosen.label}`, icon: 'none' })
  } catch (err) {
    if (!String(errorMessage(err)).includes('cancel')) {
      uni.showToast({ title: errorMessage(err), icon: 'none' })
    }
  }
}

async function saveNickname(): Promise<void> {
  const name = nickname.value.trim()
  if (!name || name === myName.value) return
  try {
    await menuCo().setNickname(name)
    await session.refreshFamily()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

async function leave(): Promise<void> {
  const { confirm } = await uni.showModal({
    title: '退出这个家庭？',
    content: '菜谱和记录都会留在家庭里，之后用邀请码还能再加入',
    confirmText: '退出',
  })
  if (!confirm) return
  try {
    await menuCo().leaveFamily()
    await session.refreshFamily()
    uni.navigateBack()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}
</script>

<style lang="scss" scoped>
.section {
  padding: 0 var(--space-4);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.group-title {
  padding: 0 var(--space-1);
  color: var(--c-text-2);
  font-size: 13px;
  font-weight: 600;
}

.hint {
  padding: 0 var(--space-1);
}
</style>
