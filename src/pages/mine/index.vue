<template>
  <view class="with-tabbar">
    <view class="hero">
      <view class="profile">
        <view class="avatar">
          <image v-if="myAvatar" class="avatar-image" :src="myAvatar" mode="aspectFill" />
          <text v-else>{{ initial(family ? myName : '家') }}</text>
        </view>
        <view class="profile-main">
          <view class="profile-name">{{ family ? myName : '欢迎来到家庭菜单' }}</view>
          <view v-if="family" class="profile-family"
            >{{ family.name }} · {{ members.length }} 位家人</view
          >
        </view>
      </view>
    </view>

    <view class="sheet">
      <StateView :loading="loading" :error="error" @retry="reload">
        <template v-if="family">
          <view class="family-card">
            <view class="family-top">
              <view class="family-info">
                <view class="family-label">家人 · {{ members.length }} 位</view>
                <view class="members">
                  <view v-for="m in members" :key="m.uid ?? 'default-baby'" class="member">
                    <view class="avatar sm">
                      <image v-if="m.avatar" class="avatar-image" :src="m.avatar" mode="aspectFill" />
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
            <view class="line hairline" @click="go('/pages/diary/index')">
              <text class="line-main">饮食日记</text>
              <text class="value">本月 {{ servedCount }} 餐</text>
              <text class="chev">›</text>
            </view>
            <view class="line hairline" @click="go('/pages/categories/index')">
              <text class="line-main">菜品分类</text>
              <text class="value">{{ family.categories.length }} 个</text>
              <text class="chev">›</text>
            </view>
            <view class="line hairline">
              <text class="line-main">我的称呼</text>
              <input
                v-model="nickname"
                class="setting-input"
                placeholder="比如：妈妈"
                maxlength="12"
                @blur="saveNickname"
              />
            </view>
            <view class="line hairline" @click="leave">
              <text class="line-main danger">退出这个家庭</text>
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
  </view>
</template>

<script setup lang="ts">
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import EmptyState from '@/components/EmptyState.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useTabBar } from '@/composables/use-tab-bar'
import { useSessionStore } from '@/stores/session'
import { today } from '@/utils/date'

useTabBar(3)

const session = useSessionStore()
const { family, uid } = storeToRefs(session)
const newName = ref('')
const code = ref('')
const nickname = ref('')
const servedCount = ref(0)
const sharedCode = ref('')
const invite = ref<{ name: string; memberCount: number } | null>(null)

const myName = computed(() => family.value?.members.find((m) => m.uid === uid.value)?.nickname ?? '家人')
const myAvatar = computed(() => avatarFor(myName.value))
const babyName = '小莲花'
const babyAvatar = '/static/avatars/baby.png'
const members = computed(() => {
  if (!family.value) return []
  const people = family.value.members.map((member) => ({ ...member, avatar: avatarFor(member.nickname) }))
  if (people.some((member) => member.avatar === babyAvatar)) return people
  return [...people, { uid: null, nickname: babyName, avatar: babyAvatar }]
})

const portraits = [
  { suffix: /(?:姥姥|外婆|奶奶|祖母|阿嬷)$/, src: '/static/avatars/grandma.png' },
  { suffix: /(?:姥爷|外公|爷爷|祖父|阿公)$/, src: '/static/avatars/grandpa.png' },
  { suffix: /(?:妈妈|妈咪|母亲|宝妈)$/, src: '/static/avatars/mom.png' },
  { suffix: /(?:爸爸|爹爹|爹地|父亲|宝爸)$/, src: '/static/avatars/dad.png' },
  { suffix: /(?:宝宝|宝贝|婴儿|女宝)$/, src: babyAvatar },
]

const { loading, error, noFamily, reload } = usePageData(async () => {
  nickname.value = myName.value
  servedCount.value = (await menuCo().listServed(today().slice(0, 7))).length
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

/** 按称呼结尾匹配亲属关系，例如「小满妈妈」和「奶奶（杭州）」。 */
function avatarFor(name: string): string {
  const title = name.trim().replace(/\s*[(（][^()（）]*[)）]$/, '')
  if (title === babyName) return babyAvatar
  const portrait = portraits.find(({ suffix }) => suffix.test(title))
  return portrait?.src ?? ''
}

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

function saveNickname(): Promise<void> {
  const name = nickname.value.trim()
  if (!name || name === myName.value) return Promise.resolve()
  return run(() => menuCo().setNickname(name))
}

async function leave(): Promise<void> {
  const { confirm } = await uni.showModal({
    title: '退出这个家庭？',
    content: '菜谱和记录都会留在家庭里，之后用邀请码还能再加入',
    confirmText: '退出',
  })
  if (!confirm) return
  await run(() => menuCo().leaveFamily())
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
.profile {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-6) 0 var(--space-2);
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

.profile-name {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
}

.profile-family {
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
}

.family-card {
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

.line {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-height: 52px;
  background: transparent;

  &:active {
    opacity: 0.7;
  }
}

.line-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.strong {
    color: var(--c-accent);
    font-weight: 600;
  }

  &.danger {
    color: var(--c-danger);
  }
}

.value {
  color: var(--c-text-2);
  font-size: 14px;
}

.chev {
  color: var(--c-line-strong);
  font-size: 20px;
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

.setting-input {
  flex: 1;
  color: var(--c-text-2);
  text-align: right;
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
