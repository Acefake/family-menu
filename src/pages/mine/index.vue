<template>
  <view class="with-tabbar">
    <NavHero
      :title="family ? myName : '欢迎来到家庭菜单'"
      art="house"
      :scroll="scrollTop"
      :refreshing="refreshing"
    >
      <template #lead>
        <button class="profile-avatar" :disabled="!family" aria-label="编辑头像" @click="openAvatarPicker">
          <view class="avatar profile">
            <AvatarPortrait
              v-if="myAvatar"
              class="avatar-image"
              :src="myAvatar"
              :size="84"
              :fallback="initial(myName)"
            />
            <text v-else>{{ initial(family ? myName : '家') }}</text>
          </view>
          <view v-if="family" class="edit-badge"
            ><image src="/static/illus/avatar-edit.svg" class="edit-icon"
          /></view>
        </button>
      </template>
    </NavHero>

    <view class="sheet">
      <StateView :loading="loading" :error="error" @retry="reload">
        <template v-if="family">
          <view class="family-card">
            <view class="manage" @click="go('/pages/family/index')">家庭管理 ›</view>
            <view class="family-top">
              <view class="family-info">
                <view class="family-label">家人 · {{ members.length }} 位</view>
                <view class="members">
                  <view v-for="m in members" :key="m.uid ?? 'default-baby'" class="member">
                    <view class="avatar sm">
                      <AvatarPortrait
                        v-if="m.avatar"
                        class="avatar-image"
                        :src="m.avatar"
                        :fallback="initial(m.nickname)"
                      />
                      <text v-else>{{ initial(m.nickname) }}</text>
                    </view>
                    <text class="member-name">{{ m.uid === uid ? '我' : m.nickname }}</text>
                  </view>
                  <button class="member add" open-type="share">
                    <view class="avatar sm dashed">＋</view>
                    <text class="member-name">邀请</text>
                  </button>
                </view>
              </view>
              <image class="family-art" src="/static/illus/family.svg" mode="aspectFit" />
            </view>
            <view class="invite">
              <text class="muted">邀请码</text>
              <text class="code">{{ family.inviteCode }}</text>
              <text class="link" @click="copyCode">复制</text>
            </view>
            <button class="btn share" open-type="share">邀请家人加入</button>
          </view>

          <view class="rows">
            <view class="setting-row hairline" @click="go('/pages/feeding/index')">
              <text class="setting-label">辅食观察</text>
              <text class="setting-value">{{ feedingSummary }}</text>
              <text class="setting-chev">›</text>
            </view>
            <view class="setting-row hairline" @click="go('/pages/diary/index')">
              <text class="setting-label">饮食日记</text>
              <text class="setting-value">本月 {{ servedCount }} 餐</text>
              <text class="setting-chev">›</text>
            </view>
            <view class="setting-row hairline" @click="go('/pages/categories/index')">
              <text class="setting-label">菜品分类</text>
              <text class="setting-value">{{ family.categories.length }} 个</text>
              <text class="setting-chev">›</text>
            </view>
          </view>
        </template>

        <view v-else class="setup">
          <view v-if="sharedCode" class="invite-card">
            <view class="muted">你收到一份邀请</view>
            <view class="setup-title">加入「{{ invite?.name ?? '这个家庭' }}」</view>
            <view class="muted">{{
              invite ? `已有 ${invite.memberCount} 人加入，进来一起点菜、共享菜谱` : '进来一起点菜、共享菜谱'
            }}</view>
            <view class="btn" @click="join">加入这个家庭</view>
          </view>
          <EmptyState
            v-if="!sharedCode"
            art="house"
            title="先建一个家庭"
            desc="家人通过邀请码加入后，一起点菜、共享菜谱"
          />
          <view v-else class="setup-title">或者自己建一个家庭</view>
          <view class="field">
            <text class="field-label">家庭名</text>
            <input v-model="newName" class="field-input" placeholder="比如：幸福一家" maxlength="20" />
          </view>
          <view class="btn" @click="create">创建家庭</view>
          <view class="or">或者</view>
          <view class="field">
            <text class="field-label">邀请码</text>
            <input v-model="code" class="field-input" placeholder="家人发来的 4 位码" maxlength="8" />
          </view>
          <view class="btn plain" @click="join">加入家庭</view>
        </view>
      </StateView>
    </view>
    <AvatarPicker
      v-if="avatarPickerOpen"
      :member="myMember"
      @close="avatarPickerOpen = false"
      @saved="onAvatarSaved"
    />
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import EmptyState from '@/components/EmptyState.vue'
import NavHero from '@/components/NavHero.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useScrollTop } from '@/composables/use-scroll-top'
import { useTabBar } from '@/composables/use-tab-bar'
import { useSessionStore } from '@/stores/session'
import { today } from '@/utils/date'
import { observationDay } from '@/pages/feeding/model'

import { avatarFor } from './avatars'
import AvatarPicker from './AvatarPicker.vue'
import AvatarPortrait from './AvatarPortrait.vue'
import type { Family } from '@/types/models'

useTabBar(3)
const scrollTop = useScrollTop()

const session = useSessionStore()
const { family, uid } = storeToRefs(session)
const newName = ref('')
const code = ref('')
const servedCount = ref(0)
const feedingSummary = ref('记录宝宝的新食物')
const sharedCode = ref('')
const invite = ref<{ name: string; memberCount: number } | null>(null)

const myName = computed(() => family.value?.members.find((m) => m.uid === uid.value)?.nickname ?? '家人')
const myMember = computed(() => family.value?.members.find((m) => m.uid === uid.value))
const myAvatar = computed(
  () => myMember.value?.avatarImage || avatarFor(myName.value, myMember.value?.avatarId)
)
const avatarPickerOpen = ref(false)
/** 点击头像编辑自己的资料。 */
function openAvatarPicker(): void {
  if (family.value) avatarPickerOpen.value = true
}

function onAvatarSaved(value: Family): void {
  session.family = value
  avatarPickerOpen.value = false
}
const babyName = '小莲花'
const babyAvatar = '/static/avatars/baby.png'
const members = computed(() => {
  if (!family.value) return []
  const people = family.value.members.map((member) => ({
    ...member,
    avatar: member.avatarImage || avatarFor(member.nickname, member.avatarId),
  }))
  if (people.some((member) => member.avatar === babyAvatar)) return people
  return [...people, { uid: null, nickname: babyName, avatar: babyAvatar }]
})

const { loading, error, noFamily, refreshing, reload } = usePageData(async () => {
  servedCount.value = (await menuCo().listServed(today().slice(0, 7))).length
  feedingSummary.value = '记录宝宝的新食物'
  try {
    const food = (await menuCo().listFeeding()).find((f) => f.status === 'observing')
    if (food) feedingSummary.value = `${food.name} · 第${observationDay(food)}天`
  } catch {
    feedingSummary.value = '进入查看观察记录'
  }
})

/** 没有家庭又带着邀请码进来：弹窗问是否加入，同时在页面上留一张加入卡片 */
async function loadInvite(): Promise<void> {
  if (family.value || !sharedCode.value || invitePrompted) return
  invitePrompted = true
  try {
    invite.value = await menuCo().previewInvite(sharedCode.value)
  } catch (err) {
    // 预览失败（比如云函数还没更新）也不拦着：仍然允许用这个邀请码加入
    console.error('previewInvite failed', err)
    invite.value = null
  }
  const { confirm } = await uni.showModal({
    title: '你收到一份家庭邀请',
    content: `加入「${invite.value?.name ?? '这个家庭'}」，一起点菜、共享菜谱？`,
    confirmText: '加入',
    cancelText: '先看看',
  })
  if (confirm) await join()
}

let invitePrompted = false

watch(noFamily, () => void loadInvite())

// 通过分享卡片进入时自动带上邀请码
onLoad((query) => {
  if (!query?.code) return
  sharedCode.value = String(query.code).trim().toUpperCase()
  code.value = sharedCode.value
})

function initial(name: string): string {
  return Array.from(name.trim())[0] ?? '家'
}

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

function copyCode(): void {
  if (family.value) uni.setClipboardData({ data: family.value.inviteCode })
}

function go(url: string): void {
  uni.navigateTo({ url })
}

onShareAppMessage(() => ({
  title: `来「${family.value?.name ?? '我们家'}」一起点菜`,
  path: `/pages/mine/index?code=${family.value?.inviteCode ?? ''}`,
}))
</script>

<style lang="scss" scoped>
.profile-avatar {
  position: relative;
  padding: 0;
  margin: 0 4px 0 0;
  overflow: visible;
  background: transparent;
  line-height: 1;
}
.profile-avatar::after {
  border: 0;
}
.profile-avatar .profile {
  width: 84px;
  height: 84px;
}
.edit-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--c-accent);
  border: 1.5px solid var(--c-surface);
  border-radius: 50%;
}
.edit-icon {
  width: 10px;
  height: 10px;
}
.avatar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  overflow: hidden;
  color: var(--c-accent);
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  background: #fff;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;

  &.sm {
    width: 36px;
    height: 36px;
    font-size: 15px;
    background: var(--c-accent-soft);
    border-color: transparent;
  }

  &.dashed {
    color: var(--c-text-2);
    background: transparent;
    border: 1px dashed var(--c-line-strong);
  }
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.family-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--c-bg);
  border-radius: var(--radius-lg);
}

.family-top {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  justify-content: space-between;
}

.family-info {
  flex: 1;
  min-width: 0;
}

.family-label {
  margin-bottom: var(--space-2);
  color: var(--c-text-2);
  font-size: 13px;
  font-weight: 600;
}

.family-art {
  flex-shrink: 0;
  width: 104px;
  height: 78px;
  margin-top: var(--space-4);
}

/* 家庭卡片右上角的入口，进到家庭管理改称呼、选 AI、退出家庭 */
.manage {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  padding: 2px 10px;
  color: var(--c-accent);
  font-size: 13px;
  background: var(--c-surface);
  border-radius: var(--radius-pill);

  &:active {
    opacity: 0.7;
  }
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.member {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  min-width: 40px;
  margin: 0;
  padding: 0;
  font-size: 12px;
  line-height: 1.4;
  background: transparent;

  &::after {
    border: 0;
  }
}

.member-name {
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  padding: var(--space-3) 0 0;
  border-top: 1px solid var(--c-line);
}

.share {
  margin: 0;
  line-height: 44px;
}

.rows {
  margin-top: var(--space-4);
  padding: 0 var(--space-1);
}

.code {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 3px;
}

.link {
  margin-left: auto;
  color: var(--c-accent);
  font-size: 14px;
}

.setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.setup-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
}

.invite-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--c-accent-soft);
  border-radius: var(--radius-lg);
}

.field {
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  background: var(--c-bg);
  border-radius: var(--radius-md);
}

.field-label {
  flex: 0 0 64px;
  font-size: 14px;
}

.field-input {
  flex: 1;
  height: 44px;
}

.or {
  color: var(--c-text-2);
  font-size: 13px;
  text-align: center;
}
</style>
