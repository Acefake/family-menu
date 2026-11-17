<template>
  <view class="feeding-page">
    <FeedingHeader title="辅食观察" subtitle="一次一种，慢慢认识新食物" />
    <view class="feeding-content feeding-sheet">
      <NoFamily v-if="noFamily" />
      <StateView v-else :loading="loading" :error="error" @retry="reload">
        <view class="home-tabs">
          <button :class="{ selected: tab === 'observing' }" @click="tab = 'observing'">观察中</button>
          <button :class="{ selected: tab === 'history' }" @click="tab = 'history'">历史记录</button>
          <button :class="{ selected: tab === 'archive' }" @click="tab = 'archive'">食物档案</button>
        </view>
        <FoodArchive v-if="tab === 'archive'" :foods="foods" @saved="reload" />
        <template v-else>
          <view class="feeding-notice">一次只新增 1 种食物 · 观察 3–5 天</view>
          <template v-if="tab === 'observing'">
            <view v-if="active" class="feeding-box active-food">
              <view class="feeding-row"
                ><view class="feeding-row"
                  ><image class="active-food-icon" :src="foodIcon(active.name)" mode="aspectFit" /><text
                    class="food-name"
                    >{{ active.name }}</text
                  ><text v-if="active.logs[0]?.first" class="first-label">首次添加</text></view
                ><text class="feeding-chip observing">观察中</text></view
              >
              <view class="feeding-small">{{ monthDay(active.startDate) }}开始</view>
              <view class="steps"
                ><view
                  v-for="day in active.days"
                  :key="day"
                  :class="[
                    'step',
                    { done: day <= observedDays(active), current: day === observationDay(active) },
                  ]"
                  ><wd-icon v-if="day <= observedDays(active)" name="check" size="15px" /><text v-else>{{
                    day
                  }}</text></view
                ></view
              >
              <view class="progress-label">第 {{ observationDay(active) }} 天 / 共 {{ active.days }} 天</view>
              <view class="feeding-row summary"
                ><text>最近食用量</text><text>{{ lastLog ? `${lastLog.amount} g` : '尚未记录' }}</text></view
              >
              <view class="feeding-row summary"
                ><text>最近观察</text><text>{{ lastLog ? '暂无异常' : '等待首次打卡' }}</text></view
              >
              <button class="feeding-button" @click="checkin(active.id)">
                {{ recordedToday ? '查看 / 修改今日观察' : '记录今天的观察' }}
              </button>
              <button class="feeding-text-button" @click="pause">暂停此食物观察</button>
            </view>
            <view v-else class="observation-empty">
              <view class="empty-illustration">
                <image class="empty-food side-food" src="/static/feeding/carrot.svg" mode="aspectFit" />
                <image class="empty-food main-food" src="/static/feeding/millet.svg" mode="aspectFit" />
                <image class="empty-food side-food" src="/static/feeding/potato.svg" mode="aspectFit" />
              </view>
              <view class="empty-title">{{
                foods.length ? '今天没有进行中的观察' : '从第一种新食物开始'
              }}</view>
              <view class="empty-description">{{
                foods.length
                  ? '已有食物和观察结果保存在「食物档案」，\n准备尝试新食物时，再开始一次观察。'
                  : '添加一种新食物，记下每天的食用量，\n慢慢了解宝宝的身体反应。'
              }}</view>
            </view>
            <button
              :class="['feeding-button', 'add-button', { 'feeding-outline': !!active }]"
              @click="addOpen = true"
            >
              <wd-icon name="add" />添加新食物
            </button>
          </template>
          <template v-else>
            <view v-if="!recent.length" class="feeding-empty">还没有打卡记录</view>
            <view v-for="row in recent" :key="row.food.id + row.log.date" class="history-item">
              <view class="feeding-row"
                ><text>{{ row.food.name }}</text
                ><text :class="['feeding-chip', { pending: !row.log.normal }]">{{
                  row.log.normal ? '无异常' : '有异常'
                }}</text></view
              >
              <view class="feeding-small"
                >{{ row.log.date }} · {{ row.log.amount }} g ·
                {{ row.log.first ? '首次食用' : '非首次食用' }}</view
              >
              <view class="history-actions"
                ><button
                  class="record-action"
                  :disabled="deleting"
                  @click="checkin(row.food.id, row.log.date)"
                >
                  编辑</button
                ><button
                  class="record-action delete-action"
                  :disabled="deleting"
                  @click="removeLog(row.food, row.log.date)"
                >
                  删除
                </button></view
              >
            </view>
          </template>
        </template>
      </StateView>
    </view>
    <wd-popup
      v-model="addOpen"
      position="bottom"
      closable
      safe-area-inset-bottom
      custom-style="border-radius:16px 16px 0 0"
    >
      <view class="feeding-content add-form"
        ><view class="feeding-title">添加新食物</view
        ><text class="feeding-small">一次只新增一种食物，首日少量尝试</text
        ><input
          v-model="name"
          class="feeding-input"
          placeholder="食物名称，例如：土豆泥"
          maxlength="30"
        /><view class="feeding-field"
          ><text>添加日期</text
          ><picker mode="date" :value="startDate" :end="today()" @change="startDate = $event.detail.value"
            ><text>{{ startDate }} ›</text></picker
          ></view
        ><view class="feeding-field"
          ><text>观察周期</text
          ><picker
            :range="['3 天', '4 天', '5 天']"
            :value="days - 3"
            @change="days = Number($event.detail.value) + 3"
            ><text>{{ days }} 天 ›</text></picker
          ></view
        ><view v-if="active" class="feeding-notice">请先完成或暂停「{{ active.name }}」的观察</view
        ><button class="feeding-button" :disabled="saving || !!active" :loading="saving" @click="create">
          开始观察</button
        ><view v-if="saveError" class="feeding-notice feeding-danger">{{ saveError }}</view></view
      >
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage, menuCo } from '@/api/menu'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { monthDay, today } from '@/utils/date'
import FeedingHeader from './FeedingHeader.vue'
import FoodArchive from './FoodArchive.vue'
import { foodIcon } from './food-icons'
import { deleteFeedingRecord } from './record-actions'
import { observationDay, observedDays, type FeedingFood } from './model'

const foods = ref<FeedingFood[]>([])
const { loading, error, noFamily, reload } = usePageData(async () => {
  foods.value = await menuCo().listFeeding()
})
const active = computed(() => foods.value.find((f) => f.status === 'observing'))
const lastLog = computed(() => active.value?.logs.slice(-1)[0])
const recordedToday = computed(() => active.value?.logs.some((l) => l.date === today()))
const recent = computed(() =>
  foods.value
    .flatMap((food) => food.logs.map((log) => ({ food, log })))
    .sort((a, b) => b.log.date.localeCompare(a.log.date))
)
const tab = ref<'observing' | 'history' | 'archive'>('observing')
const addOpen = ref(false)
const name = ref('')
const startDate = ref(today())
const days = ref(5)
const saving = ref(false)
const saveError = ref('')
function checkin(id: string, date = today()): void {
  uni.navigateTo({ url: `/pages/feeding/checkin?id=${encodeURIComponent(id)}&date=${date}` })
}
const deleting = ref(false)
async function removeLog(food: FeedingFood, date: string): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  try {
    if (await deleteFeedingRecord(food.id, food.name, date)) await reload()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    deleting.value = false
  }
}
async function create(): Promise<void> {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const id = await menuCo().createFeeding({
      name: name.value.trim(),
      startDate: startDate.value,
      days: days.value,
    })
    addOpen.value = false
    name.value = ''
    await reload()
    checkin(id)
  } catch (err) {
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
async function pause(): Promise<void> {
  if (!active.value) return
  const { confirm } = await uni.showModal({
    title: '暂停观察',
    content: '此食物将归入待观察档案，有可疑反应时请先咨询医生。',
  })
  if (!confirm) return
  try {
    await menuCo().setFeedingStatus(active.value.id, 'pending')
    await reload()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}
</script>

<style lang="scss" scoped>
@use './feeding.scss';
.history-item {
  padding: 12px 0 0;
  border-bottom: 1px solid var(--c-line);
}
.history-item > .feeding-small {
  margin-top: 4px;
}
.history-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.record-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 40px;
  padding: 0 8px;
  margin: 0;
  color: var(--c-accent);
  font-size: 13px;
  line-height: 1.5;
  background: transparent;
}
.record-action::after {
  border: 0;
}
.delete-action {
  color: var(--c-danger);
}

.feeding-page {
  display: flex;
  flex-direction: column;
  background: var(--c-surface);
}
.feeding-sheet {
  flex: 1;
  gap: 8px;
}
:deep(.feeding-header) {
  padding-bottom: 20px;
}
:deep(.header-kicker) {
  display: none;
}
:deep(.hero-title) {
  margin-top: 2px;
  font-size: 26px;
}
:deep(.header-art) {
  width: 92px;
  height: 64px;
}
.observation-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 8px 0;
  text-align: center;
}
.empty-illustration {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.empty-food {
  flex-shrink: 0;
}
.side-food {
  width: 40px;
  height: 40px;
}
.main-food {
  width: 68px;
  height: 68px;
}
.empty-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
}
.empty-description {
  margin-top: 8px;
  color: var(--c-text-2);
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-line;
}
.active-food-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}
.home-tabs {
  display: flex;
  margin: -4px -12px 12px;
  border-bottom: 1px solid var(--c-line);
}
.home-tabs button {
  flex: 1;
  padding: 10px 12px;
  margin: 0;
  font-family: var(--font-serif);
  font-size: 18px;
  line-height: 1.5;
  background: transparent;
  border-radius: 0;
}
.home-tabs button::after {
  border: 0;
}
.home-tabs .selected {
  font-weight: 700;
  border-bottom: 3px solid var(--c-accent);
}
.active-food {
  margin-top: 12px;
}
.food-name {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.first-label {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 11px;
  background: var(--c-bg);
  border: 1px solid var(--c-line-strong);
  border-radius: 5px;
}
.steps {
  position: relative;
  display: flex;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.steps::before {
  content: '';
  position: absolute;
  top: 13px;
  left: 13px;
  right: 13px;
  height: 2px;
  background: var(--c-line-strong);
}
.step {
  position: relative;
  z-index: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--c-text-2);
  border: 1px solid var(--c-line-strong);
  border-radius: 50%;
  background: white;
}
.step.done {
  color: white;
  background: #789b70;
  border-color: #789b70;
}
.step.current:not(.done) {
  color: white;
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.progress-label {
  margin-bottom: 12px;
  color: var(--c-text-2);
  font-size: 13px;
  text-align: center;
}
.summary {
  min-height: 40px;
  font-size: 13px;
  border-top: 1px solid var(--c-line);
}
.active-food .feeding-button {
  margin-top: 12px;
}
.add-button {
  min-height: 46px;
  margin-top: 16px;
}
.add-form {
  padding-top: 16px;
}
</style>
