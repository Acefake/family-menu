<template>
  <view class="page">
    <view>
      <view class="muted">{{ relativeDay(slotDate) }} · {{ MEAL_LABEL[slotMeal] }}</view>
      <view class="page-title">{{ editing ? '编辑这餐' : '记下这餐' }}</view>
    </view>

    <StateView :loading="loading" :error="error" @retry="reload">
      <view class="photo" @click="choosePhoto">
        <image v-if="photoUrl" class="photo-img" :src="photoUrl" mode="aspectFill" />
        <text v-if="!photoUrl" class="muted">{{
          uploading ? '上传中…' : '＋ 拍一张整桌的照片（选填）'
        }}</text>
      </view>

      <view class="card list">
        <view v-for="d in rows" :key="d._id" class="row hairline">
          <view :class="['check', { on: cooked.has(d._id) }]" @click="toggle(d._id)">
            {{ cooked.has(d._id) ? '✓' : '' }}
          </view>
          <view class="row-main" @click="toggle(d._id)">
            <text class="row-name">{{ d.name }}</text>
            <text class="muted">{{ cooked.has(d._id) ? '做了' : '没做' }}</text>
          </view>
          <view class="stars">
            <text
              v-for="n in 5"
              :key="n"
              :class="['star', { on: (ratings[d._id] ?? 0) >= n }]"
              @click="rate(d._id, n)"
            >
              ★
            </text>
          </view>
        </view>
      </view>
      <view class="muted hint">{{
        editing
          ? '改了做了哪些菜，菜谱里的“吃过几次”会跟着增减。'
          : '只有勾了“做了”的菜会算一次，菜谱里的“吃过几次”也跟着加。'
      }}</view>
    </StateView>

    <view class="bar">
      <view :class="['btn grow', { disabled: saving }]" @click="save">{{
        editing ? '保存修改' : '记录'
      }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'
import { type Dish, MEAL_LABEL, type Meal } from '@/types/models'
import { relativeDay } from '@/utils/date'
import { usePhotoUrl } from '@/utils/photo'

const { date, meal } = storeToRefs(useSessionStore())
/** 从饮食日记、这顿页点「编辑」进来时，URL 里带着要改的是哪天哪顿；平时记下这餐用的是当前正在看的那一顿 */
const editDate = ref('')
const editMeal = ref<Meal | ''>('')
const editing = computed(() => !!editDate.value && !!editMeal.value)
const slotDate = computed(() => editDate.value || date.value)
const slotMeal = computed<Meal>(() => editMeal.value || meal.value)

onLoad((query) => {
  const d = String(query?.date ?? '')
  const m = String(query?.meal ?? '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && ['breakfast', 'lunch', 'dinner'].includes(m)) {
    editDate.value = d
    editMeal.value = m as Meal
  }
})
const rows = ref<Dish[]>([])
const cooked = ref(new Set<string>())
const ratings = ref<Record<string, number>>({})
const photo = ref('')
const photoUrl = usePhotoUrl(() => photo.value)
const uploading = ref(false)
const saving = ref(false)

/** 勾选、评分、照片只在第一次加载时按这一顿的内容初始化；选照片回来页面会再显示一次，不能把刚改的冲掉 */
let initialized = false

const { loading, error, reload } = usePageData(async () => {
  const [slot, dishes] = await Promise.all([
    menuCo().getSlot(slotDate.value, slotMeal.value),
    menuCo().listDishes(),
  ])
  const ids = new Set(slot.selections.flatMap((s) => s.dishIds))
  rows.value = dishes.filter((d) => ids.has(d._id))
  if (initialized) return
  initialized = true
  if (editing.value && slot.status === 'served') {
    // 已开饭的：把当时记下的做了哪些菜、评分、整桌照带出来改
    cooked.value = new Set(slot.cooked ?? [])
    ratings.value = { ...slot.ratings }
    photo.value = slot.photo ?? ''
  } else {
    cooked.value = new Set(rows.value.map((d) => d._id))
  }
})

function toggle(id: string): void {
  const next = new Set(cooked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  cooked.value = next
}

/** 再点一次同样的星数就取消评分 */
function rate(id: string, n: number): void {
  const next = { ...ratings.value }
  if (next[id] === n) delete next[id]
  else next[id] = n
  ratings.value = next
}

async function choosePhoto(): Promise<void> {
  try {
    const { tempFilePaths } = await uni.chooseImage({ count: 1, sizeType: ['compressed'] })
    const filePath = Array.isArray(tempFilePaths) ? tempFilePaths[0] : tempFilePaths
    uploading.value = true
    const res = await uniCloud.uploadFile({ filePath, cloudPath: `meal/${Date.now()}.jpg` })
    photo.value = res.fileID
  } catch (err) {
    if (!String(errorMessage(err)).includes('cancel')) {
      uni.showToast({ title: errorMessage(err), icon: 'none' })
    }
  } finally {
    uploading.value = false
  }
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const input = { cookedIds: [...cooked.value], ratings: ratings.value, photo: photo.value }
    if (editing.value) {
      await menuCo().updateServed(slotDate.value, slotMeal.value, input)
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 400)
      return
    }
    await menuCo().serveSlot(slotDate.value, slotMeal.value, input)
    uni.showToast({ title: '已记下', icon: 'success' })
    setTimeout(() => uni.redirectTo({ url: '/pages/diary/index' }), 400)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: 110px;
}

.photo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 160px;
  overflow: hidden;
  background: var(--c-surface);
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--radius-lg);
}

.photo-img {
  width: 100%;
  height: 100%;
}

.list {
  padding: 0 var(--space-4);
}

.row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) 0;
}

.check {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: #fff;
  font-size: 13px;
  border: 1.5px solid var(--c-line-strong);
  border-radius: 50%;

  &.on {
    background: var(--c-done);
    border-color: var(--c-done);
  }
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-name {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
}

.stars {
  display: flex;
}

.star {
  padding: 0 2px;
  color: var(--c-line-strong);
  font-size: 20px;

  &.on {
    color: #d9a441;
  }
}

.hint {
  padding: 0 var(--space-1);
}

.grow {
  flex: 1;
}
</style>
