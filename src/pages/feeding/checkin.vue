<template>
  <view class="feeding-page">
    <FeedingHeader title="每日打卡" compact />
    <view class="feeding-content">
      <NoFamily v-if="noFamily" />
      <StateView v-else :loading="loading" :error="error" @retry="reload">
        <template v-if="food">
          <picker
            mode="date"
            :value="day"
            :start="food.startDate"
            :end="today()"
            :disabled="editing"
            @change="selectDate($event.detail.value)"
            ><view class="date-label"
              ><wd-icon name="calendar" /> {{ day.replace('-', '年').replace('-', '月') }}日
              {{ weekdayName(day) }} <text class="feeding-small">切换日期 ›</text></view
            ></picker
          >
          <view class="food-summary"
            ><image :src="foodIcon(food.name)" mode="aspectFit" /><text>{{ food.name }}</text
            ><text class="feeding-small">观察记录 {{ food.logs.length }} / {{ food.days }} 天</text></view
          >
          <view class="feeding-field"
            ><text>食用量</text
            ><input
              v-model="amount"
              class="feeding-input"
              type="digit"
              placeholder="填写实际食用量"
              :disabled="readonly"
            /><text>g</text></view
          >
          <view class="feeding-field"
            ><text>是否第一次吃</text
            ><radio-group class="radio-options" @change="first = $event.detail.value === 'yes'"
              ><label><radio value="yes" :checked="first" color="#304d60" :disabled="readonly" />是</label
              ><label
                ><radio value="no" :checked="!first" color="#304d60" :disabled="readonly" />否</label
              ></radio-group
            ></view
          >
          <view class="feeding-title section-title">今天有没有这些情况？</view>
          <view
            :class="['feeding-choice normal-choice', { selected: normal }]"
            role="checkbox"
            :aria-checked="normal"
            @click="toggleNormal"
            ><view class="feeding-check"><wd-icon v-if="normal" name="check" size="13px" /></view
            ><text>暂未发现异常</text></view
          >
          <view class="symptom-grid"
            ><view
              v-for="symptom in symptoms"
              :key="symptom.id"
              :class="['feeding-choice', { selected: selected.includes(symptom.id) }]"
              role="checkbox"
              :aria-checked="selected.includes(symptom.id)"
              @click="toggleSymptom(symptom.id)"
              ><view class="feeding-check"
                ><wd-icon v-if="selected.includes(symptom.id)" name="check" size="13px" /></view
              ><text>{{ symptom.label }}</text></view
            ></view
          >
          <view class="detail-head" @click="detailsOpen = !detailsOpen"
            ><view
              >异常详情（有症状时填写）<view class="feeding-small">发生时间、症状描述、处理方式</view></view
            ><wd-icon :name="detailsOpen ? 'arrow-up' : 'arrow-down'"
          /></view>
          <view v-if="detailsOpen" class="details"
            ><view class="feeding-field"
              ><text>发生时间</text
              ><picker
                mode="time"
                :value="time || '12:00'"
                :disabled="readonly"
                @change="time = $event.detail.value"
                ><text>{{ time || '请选择时间' }} ›</text></picker
              ></view
            ><textarea
              v-model="description"
              class="feeding-textarea"
              maxlength="500"
              :disabled="readonly"
              placeholder="症状位置、持续时间及其他表现"
            /><view class="action-options"
              ><view
                v-for="action in actions"
                :key="action.id"
                :class="['feeding-choice', { selected: chosenActions.includes(action.id) }]"
                @click="toggleAction(action.id)"
                ><view class="feeding-check"
                  ><wd-icon v-if="chosenActions.includes(action.id)" name="check" size="13px" /></view
                >{{ action.label }}</view
              ></view
            ></view
          >
          <view class="note-label">备注（选填）</view
          ><textarea
            v-model="note"
            class="feeding-textarea"
            maxlength="500"
            :disabled="readonly"
            placeholder="记录做法、状态或其他变化…"
          />
          <view class="feeding-notice feeding-danger">呼吸困难或喉舌肿胀，请立即就医。</view>
          <view v-if="readonly" class="feeding-notice"
            >此食物已暂停，仅查看记录。请先咨询医生，勿自行反复试吃。</view
          >
          <view v-if="saveError" class="feeding-notice feeding-danger">{{ saveError }}</view>
          <button
            v-if="!readonly"
            class="feeding-button save-button"
            :loading="saving"
            :disabled="saving"
            @click="save"
          >
            {{ editing ? '保存修改' : '保存今日打卡' }}
          </button>
          <button v-else class="feeding-button feeding-outline save-button" @click="back">返回</button>
        </template>
        <view v-else class="feeding-empty">食物记录不存在，请返回重新选择。</view>
      </StateView>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { errorMessage, menuCo } from '@/api/menu'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { today, weekdayName } from '@/utils/date'
import FeedingHeader from './FeedingHeader.vue'
import { foodIcon } from './food-icons'
import { actions, symptoms, type FeedingFood } from '@/types/feeding'

const id = ref('')
function back(): void {
  uni.navigateBack()
}
const day = ref(today())
const food = ref<FeedingFood>()
const amount = ref('')
const first = ref(true)
const normal = ref(false)
const selected = ref<string[]>([])
const chosenActions = ref<string[]>([])
const time = ref('')
const description = ref('')
const note = ref('')
const detailsOpen = ref(false)
const saving = ref(false)
const saveError = ref('')
const editing = computed(() => !!food.value?.logs.some((log) => log.date === day.value))
const readonly = computed(
  () => !editing.value && (food.value?.status === 'pending' || food.value?.status === 'confirmed')
)
onLoad((query) => {
  id.value = String(query?.id || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query?.date || ''))) day.value = String(query?.date)
})
const { loading, error, noFamily, reload } = usePageData(async () => {
  food.value = (await menuCo().listFeeding()).find((f) => f.id === id.value)
  fill()
})
function fill(): void {
  const log = food.value?.logs.find((l) => l.date === day.value)
  amount.value = log ? String(log.amount) : ''
  first.value = log?.first ?? !food.value?.logs.length
  normal.value = log?.normal ?? false
  selected.value = [...(log?.symptoms || [])]
  chosenActions.value = [...(log?.actions || [])]
  time.value = log?.time || ''
  description.value = log?.description || ''
  note.value = log?.note || ''
  detailsOpen.value = !!log && !log.normal
}
function selectDate(value: string): void {
  day.value = value
  fill()
  saveError.value = ''
}
function toggleNormal(): void {
  if (readonly.value) return
  normal.value = !normal.value
  if (normal.value) selected.value = []
}
function toggleSymptom(value: string): void {
  if (readonly.value) return
  selected.value = selected.value.includes(value)
    ? selected.value.filter((s) => s !== value)
    : [...selected.value, value]
  normal.value = false
  if (selected.value.length) detailsOpen.value = true
}
function toggleAction(value: string): void {
  if (readonly.value) return
  chosenActions.value = chosenActions.value.includes(value)
    ? chosenActions.value.filter((a) => a !== value)
    : [...chosenActions.value, value]
}
async function save(): Promise<void> {
  if (saving.value || readonly.value) return
  saveError.value = ''
  if (
    !amount.value.trim() ||
    !Number.isFinite(Number(amount.value)) ||
    Number(amount.value) <= 0 ||
    Number(amount.value) > 1000
  ) {
    saveError.value = '请填写大于0且不超过1000 g的食用量'
    return
  }
  if (!normal.value && !selected.value.length) {
    saveError.value = '请选择暂无异常或具体症状'
    return
  }
  if (!normal.value && (!time.value || !description.value.trim())) {
    detailsOpen.value = true
    saveError.value = '请填写异常发生时间与症状描述'
    return
  }
  saving.value = true
  try {
    await menuCo().saveFeedingLog(id.value, {
      date: day.value,
      amount: Number(amount.value),
      first: first.value,
      normal: normal.value,
      symptoms: selected.value,
      time: time.value,
      description: description.value,
      actions: chosenActions.value,
      note: note.value,
    })
    uni.showToast({ title: '打卡已保存', icon: 'success' })
    uni.navigateBack()
  } catch (err) {
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
@use './feeding.scss';
.date-label {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
}
.date-label .feeding-small {
  margin-left: auto;
}
.food-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: var(--c-muted-bg);
  border-radius: 8px;
}
.food-summary image {
  width: 28px;
  height: 28px;
}
.food-summary > text:first-of-type {
  font-family: var(--font-serif);
  font-size: 20px;
  overflow-wrap: anywhere;
}
.radio-options {
  display: flex;
  flex: 1;
  gap: 16px;
}
.radio-options label {
  display: flex;
  align-items: center;
  font-size: 14px;
}
.radio-options radio {
  transform: scale(0.75);
}
.section-title {
  margin: 16px 0 8px;
}
.normal-choice {
  font-weight: 600;
}
.symptom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 8px 0 12px;
}
.symptom-grid .feeding-choice {
  padding: 6px;
  font-size: 12px;
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--c-line);
  border-bottom: 1px solid var(--c-line);
}
.details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
}
.action-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.note-label {
  margin: 12px 0 6px;
}
.feeding-notice {
  margin-top: 12px;
}
.save-button {
  margin-top: 12px;
}
</style>
