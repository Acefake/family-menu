<template>
  <view class="page">
    <StateView :loading="loading" :error="error" @retry="reload">
      <view v-if="family" class="card family">
        <view class="family-head">
          <view>
            <view class="family-name">{{ family.name }}</view>
            <view class="muted">{{ family.members.length }} 位成员</view>
          </view>
          <text class="muted">邀请码 {{ family.inviteCode }}</text>
        </view>
        <view class="members">
          <view v-for="m in family.members" :key="m.uid" class="member">
            <view class="avatar">{{ m.nickname.slice(0, 1) }}</view>
            <text>{{ m.nickname }}</text>
          </view>
        </view>
        <wd-input v-model="nickname" label="我的称呼" placeholder="比如：妈妈" @blur="saveNickname" />
        <wd-button block open-type="share">邀请家人加入</wd-button>
      </view>

      <view v-else class="card setup">
        <view class="family-name">先建一个家庭</view>
        <view class="muted">家人通过邀请码加入后，一起点菜、共享菜谱</view>
        <wd-input v-model="newName" label="家庭名" placeholder="比如：幸福一家" />
        <wd-button block @click="create">创建家庭</wd-button>
        <wd-input v-model="code" label="邀请码" placeholder="家人发来的 4 位码" />
        <wd-button block plain @click="join">加入家庭</wd-button>
      </view>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { family, uid } = storeToRefs(session)
const newName = ref('')
const code = ref('')
const nickname = ref('')

const { loading, error, reload } = usePageData(async () => {
  nickname.value = family.value?.members.find((m) => m.uid === uid.value)?.nickname ?? ''
})

// 通过分享卡片进入时自动带上邀请码
onLoad((query) => {
  if (query?.code) code.value = String(query.code)
})

async function run(task: () => Promise<unknown>): Promise<void> {
  try {
    await task()
    await session.refreshFamily()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

function create(): Promise<void> {
  return run(() => menuCo().createFamily(newName.value.trim() || '我们家'))
}

function join(): Promise<void> {
  return run(() => menuCo().joinFamily(code.value.trim().toUpperCase()))
}

function saveNickname(): Promise<void> {
  const name = nickname.value.trim()
  if (!name) return Promise.resolve()
  return run(() => menuCo().setNickname(name))
}

onShareAppMessage(() => ({
  title: `来「${family.value?.name ?? '我们家'}」一起点菜`,
  path: `/pages/mine/index?code=${family.value?.inviteCode ?? ''}`,
}))
</script>

<style lang="scss" scoped>
.family,
.setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
}

.family-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.family-name {
  font-size: 18px;
  font-weight: 700;
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.member {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  font-size: 13px;
}

.avatar {
  width: 48px;
  height: 48px;
  font-size: 18px;
  font-weight: 700;
  line-height: 48px;
  text-align: center;
  background: var(--c-accent-soft);
  border-radius: 50%;
}
</style>
