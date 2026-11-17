<template>
  <view>
    <view class="search"
      ><wd-icon name="search" /><input v-model="search" placeholder="搜索食物" maxlength="30"
    /></view>
    <view class="feeding-tabs"
      ><button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['feeding-tab', { active: filter === tab.id }]"
        @click="filter = tab.id"
      >
        {{ tab.label }} {{ count(tab.id) }}
      </button></view
    >
    <view class="feeding-small category-hint">{{
      filter === 'safe'
        ? '仅表示已有记录中未见异常。'
        : filter === 'pending'
          ? '含正在观察与已暂停的食物。'
          : '由家人记录医生确认的信息，不自动诊断。'
    }}</view>
    <view v-if="filtered.length" class="feeding-list"
      ><view v-for="food in filtered" :key="food.id" class="feeding-list-row" @click="detail = food"
        ><image class="food-icon" :src="foodIcon(food.name)" mode="aspectFit" /><view class="feeding-grow"
          ><view class="food-label">{{ food.name }}</view
          ><view class="feeding-small">{{
            food.status === 'pending' ? '曾有可疑反应或已暂停' : `已观察${food.logs.length}天`
          }}</view></view
        ><text :class="['feeding-chip', food.status]">{{ statusLabel(food) }}</text
        ><wd-icon name="arrow-right" size="15px" /></view
    ></view>
    <view v-else class="feeding-empty">{{ search ? '没有匹配的食物' : '此分类还没有食物记录' }}</view>
    <view v-if="filter === 'safe' && pending.length" class="pending-section"
      ><view class="pending-heading">待观察</view
      ><view v-for="food in pending" :key="food.id" class="feeding-list-row" @click="detail = food"
        ><image class="food-icon" :src="foodIcon(food.name)" mode="aspectFit" /><view class="feeding-grow"
          ><view class="food-label">{{ food.name }}</view
          ><view class="feeding-small">曾有可疑反应 · 已暂停</view></view
        ><text class="feeding-chip pending">待评估</text></view
      ></view
    >
    <view class="tips"
      ><view class="feeding-title">记录小贴士</view
      ><view>局部接触发红不等于食物过敏，记录位置与持续时间。</view
      ><view>疑似过敏请暂停并咨询医生，勿自行反复试吃。</view></view
    >
    <button class="feeding-button feeding-outline" :disabled="!foods.length" @click="exportRecords">
      <wd-icon name="download" />导出观察记录
    </button>
    <view class="feeding-small footer-note">记录用于追踪，不能替代诊断。</view>
    <wd-popup
      :model-value="!!detail"
      position="bottom"
      closable
      safe-area-inset-bottom
      custom-style="border-radius:16px 16px 0 0"
      @update:model-value="closeDetail"
    >
      <view v-if="detail" class="detail-panel">
        <view class="detail-header">
          <image class="detail-icon" :src="foodIcon(detail.name)" mode="aspectFit" />
          <view class="detail-heading">
            <view class="detail-title">{{ detail.name }}</view>
            <view class="detail-meta">{{ detail.startDate }} 添加 · {{ detail.days }} 天观察</view>
          </view>
        </view>
        <view class="detail-overview">
          <text :class="['feeding-chip', detail.status]">{{ statusLabel(detail) }}</text>
          <text class="feeding-small">共 {{ detail.logs.length }} 次记录</text>
        </view>
        <scroll-view scroll-y class="detail-scroll">
          <view class="detail-body">
            <view v-if="detail.medicalNote" class="medical-summary">
              <view class="detail-section-title">医生确认信息</view>
              <view class="detail-value">{{ detail.medicalNote }}</view>
            </view>
            <view class="detail-section-title">观察记录</view>
            <view v-if="!detail.logs.length" class="feeding-empty">尚未打卡</view>
            <view v-for="log in detail.logs" :key="log.date" class="log-detail">
              <view class="log-heading">
                <text class="log-date">{{ log.date }}</text>
                <text :class="['feeding-chip', { pending: !log.normal }]">{{
                  log.normal ? '无异常' : '有异常'
                }}</text>
              </view>
              <view class="log-meal"
                ><text class="log-amount">{{ log.amount }}<text class="log-unit"> g</text></text
                ><text class="log-first">{{ log.first ? '首次食用' : '非首次食用' }}</text></view
              >
              <template v-if="!log.normal">
                <view class="log-field"
                  ><text class="log-label">症状</text
                  ><view class="detail-value symptoms-value">{{ symptomLabels(log.symptoms) }}</view></view
                >
                <view v-if="log.time" class="log-field"
                  ><text class="log-label">发生时间</text
                  ><text class="detail-value">{{ log.time }}</text></view
                >
                <view v-if="log.description" class="log-field"
                  ><text class="log-label">具体表现</text
                  ><text class="detail-value">{{ log.description }}</text></view
                >
                <view class="log-field"
                  ><text class="log-label">处理方式</text
                  ><text class="detail-value">{{ actionLabels(log.actions) || '未记录' }}</text></view
                >
              </template>
              <view v-if="log.note" class="log-field"
                ><text class="log-label">备注</text><text class="detail-value">{{ log.note }}</text></view
              >
              <view class="log-actions"
                ><button class="log-view-button" :disabled="deleting" @click="openLog(detail.id, log.date)">
                  编辑记录</button
                ><button
                  class="log-view-button delete-record"
                  :disabled="deleting"
                  @click="removeLog(log.date)"
                >
                  删除
                </button></view
              >
            </view>
            <view v-if="confirmOpen" class="medical-form">
              <view class="detail-section-title">记录医生确认信息</view>
              <textarea
                v-model="medicalNote"
                class="feeding-textarea"
                maxlength="500"
                placeholder="医生确认日期、医疗机构及结论（必填）"
              />
              <button class="feeding-button" :disabled="saving" :loading="saving" @click="confirmMedical">
                保存确认信息
              </button>
            </view>
            <view v-if="saveError" class="feeding-notice feeding-danger">{{ saveError }}</view>
          </view>
        </scroll-view>
        <view class="detail-footer">
          <button
            v-if="detail.status === 'observing' || detail.status === 'safe'"
            class="feeding-button"
            @click="openLog(detail.id)"
          >
            记录今天的观察
          </button>
          <button
            v-if="detail.status !== 'confirmed'"
            class="medical-trigger"
            @click="confirmOpen = !confirmOpen"
          >
            {{ confirmOpen ? '收起医生确认表单' : '记录医生确认过敏'
            }}<wd-icon :name="confirmOpen ? 'arrow-up' : 'arrow-down'" size="14px" />
          </button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, toRefs } from 'vue'
import { errorMessage, menuCo } from '@/api/menu'
import { today } from '@/utils/date'
import { foodIcon } from './food-icons'
import { deleteFeedingRecord } from './record-actions'
import { actions, exportFeeding, symptoms, type FeedingFood } from '@/types/feeding'

type Filter = 'safe' | 'pending' | 'confirmed'
const tabs: { id: Filter; label: string }[] = [
  { id: 'safe', label: '吃过无异常' },
  { id: 'pending', label: '待观察' },
  { id: 'confirmed', label: '医生确认' },
]
/** 食物档案内容，数据由所在页面统一加载，保存后通知页面刷新。 */
const props = defineProps<{ foods: FeedingFood[] }>()
const emit = defineEmits<{ (event: 'saved'): void }>()
const { foods } = toRefs(props)
const search = ref('')
const filter = ref<Filter>('safe')
const detail = ref<FeedingFood>()
const confirmOpen = ref(false)
const medicalNote = ref('')
const saving = ref(false)
const saveError = ref('')
function matches(food: FeedingFood, category: Filter): boolean {
  return category === 'pending'
    ? food.status === 'pending' || food.status === 'observing'
    : food.status === category
}
function count(category: Filter): number {
  return foods.value.filter((f) => matches(f, category)).length
}
const filtered = computed(() =>
  foods.value.filter((f) => matches(f, filter.value) && f.name.includes(search.value.trim()))
)
const pending = computed(() =>
  foods.value.filter((f) => f.status === 'pending' && f.name.includes(search.value.trim()))
)
function statusLabel(food: FeedingFood): string {
  return { observing: '观察中', safe: '无异常', pending: '待评估', confirmed: '医生确认' }[food.status]
}
function symptomLabels(ids: string[]): string {
  return symptoms
    .filter((s) => ids.includes(s.id))
    .map((s) => s.label)
    .join('、')
}
function actionLabels(ids: string[]): string {
  return actions
    .filter((a) => ids.includes(a.id))
    .map((a) => a.label)
    .join('、')
}
function closeDetail(open: boolean): void {
  if (!open) {
    detail.value = undefined
    confirmOpen.value = false
    medicalNote.value = ''
    saveError.value = ''
  }
}
function openLog(id: string, date = today()): void {
  closeDetail(false)
  uni.navigateTo({ url: `/pages/feeding/checkin?id=${encodeURIComponent(id)}&date=${date}` })
}
const deleting = ref(false)
async function removeLog(date: string): Promise<void> {
  if (!detail.value || deleting.value) return
  deleting.value = true
  try {
    if (await deleteFeedingRecord(detail.value.id, detail.value.name, date)) {
      closeDetail(false)
      emit('saved')
    }
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    deleting.value = false
  }
}
async function confirmMedical(): Promise<void> {
  if (!detail.value || saving.value) return
  saveError.value = ''
  if (!medicalNote.value.trim()) {
    saveError.value = '请填写医生确认信息'
    return
  }
  saving.value = true
  try {
    await menuCo().setFeedingStatus(detail.value.id, 'confirmed', medicalNote.value.trim())
    closeDetail(false)
    emit('saved')
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (err) {
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
function exportRecords(): void {
  uni.setClipboardData({
    data: `辅食观察记录\n\n${exportFeeding(foods.value)}\n\n记录用于追踪，不能替代诊断。`,
    success: () => {
      uni.showModal({
        title: '记录已复制',
        content: '已复制全部食物及每日观察详情，可粘贴到微信或备忘录保存、分享。',
        showCancel: false,
      })
    },
    fail: () => {
      uni.showToast({ title: '复制失败，请重试', icon: 'none' })
    },
  })
}
</script>

<style scoped lang="scss">
@use './feeding.scss';
.food-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}
.search {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--c-line-strong);
  border-radius: 8px;
}
.search input {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}
.category-hint {
  margin: 8px 0;
}
.food-label {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}
.pending-section {
  overflow: hidden;
  margin-top: 12px;
  border: 1px solid #eee3c9;
  border-radius: 10px;
}
.pending-heading {
  padding: 6px 12px;
  color: #805619;
  font-family: var(--font-serif);
  font-weight: 700;
  background: #faf0d9;
}
.tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin: 12px 0;
  font-size: 13px;
  background: var(--c-bg);
  border-radius: 10px;
}
.footer-note {
  padding-top: 8px;
  text-align: center;
}
.detail-panel {
  padding-top: 20px;
}
.detail-header {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 0 48px 0 16px;
}
.detail-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}
.detail-heading {
  flex: 1;
  min-width: 0;
}
.detail-title {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.detail-meta {
  margin-top: 4px;
  color: var(--c-text-2);
  font-size: 12px;
}
.detail-overview {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--c-line);
}
.detail-scroll {
  max-height: 50vh;
}
.detail-body {
  padding: 14px 16px 0;
}
.detail-section-title {
  color: var(--c-text-2);
  font-size: 12px;
  font-weight: 600;
}
.log-detail {
  padding: 12px 0;
  border-bottom: 1px solid var(--c-line);
}
.log-detail:last-child {
  border-bottom: 0;
}
.log-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.log-date {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.log-meal {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 8px 0 12px;
}
.log-amount {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.log-unit {
  color: var(--c-text-2);
  font-size: 13px;
  font-weight: 400;
}
.log-first {
  padding-left: 12px;
  color: var(--c-text-2);
  font-size: 12px;
  border-left: 1px solid var(--c-line-strong);
}
.log-field {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
}
.log-label {
  flex: 0 0 56px;
  color: var(--c-text-2);
}
.detail-value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.symptoms-value {
  color: #805619;
}
.log-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
}
.delete-record {
  color: var(--c-danger);
}
.log-view-button {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  min-width: 44px;
  min-height: 40px;
  padding: 8px 0 0;
  margin: 0;
  color: var(--c-accent);
  font-size: 12px;
  line-height: 1.5;
  background: transparent;
  border: 0;
}
.log-view-button::after,
.medical-trigger::after {
  border: 0;
}
.medical-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
  font-size: 13px;
}
.medical-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
}
.detail-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--c-line);
}
.medical-trigger {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  padding: 0 12px;
  margin: 0;
  color: var(--c-text-2);
  font-size: 13px;
  line-height: 1.5;
  background: var(--c-bg);
  border-radius: 8px;
}
</style>
