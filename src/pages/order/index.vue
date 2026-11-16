<template>
  <view class="order">
    <view class="head">
      <view class="head-date">{{ dayLabel }} · {{ MEAL_LABEL[meal] }}</view>
      <view class="head-title">我想吃…</view>
    </view>

    <StateView :loading="loading" :error="error" @retry="reload">
      <DishBrowser
        :dishes="dishes"
        :categories="categories"
        :picked="picked"
        :hint="othersHint"
        @toggle="toggle"
        @open="openDish"
        @manage="goCategories"
      >
        <template #empty>
          <EmptyState art="bowl" title="菜谱还是空的" desc="先去菜谱里添加或导入几道菜">
            <view class="btn small" @click="goDishes">去菜谱</view>
          </EmptyState>
        </template>
      </DishBrowser>
    </StateView>

    <view class="bar">
      <input v-model="note" class="note" maxlength="40" placeholder="给掌勺留句话（选填）" />
      <view :class="['btn', { disabled: submitting }]" @click="submit">
        {{ picked.size ? `提交 ${picked.size} 道` : changed ? '不点了' : '先挑几道' }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import DishBrowser from '@/components/DishBrowser.vue'
import EmptyState from '@/components/EmptyState.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'
import { type Dish, MEAL_LABEL, type Slot } from '@/types/models'
import { formatDay, relativeDay } from '@/utils/date'

const { date, meal, uid, family } = storeToRefs(useSessionStore())
const dishes = ref<Dish[]>([])
const slot = ref<Slot | null>(null)
const picked = ref(new Set<string>())
const original = ref<string[]>([])
const note = ref('')
const submitting = ref(false)

const categories = computed(() => family.value?.categories ?? [])
const dayLabel = computed(() => {
  const rel = relativeDay(date.value)
  return rel === formatDay(date.value) ? rel : `${rel} ${formatDay(date.value)}`
})

const changed = computed(
  () => picked.value.size !== original.value.length || original.value.some((id) => !picked.value.has(id))
)

const { loading, error, reload } = usePageData(async () => {
  const [list, s] = await Promise.all([menuCo().listDishes(), menuCo().getSlot(date.value, meal.value)])
  dishes.value = list
  slot.value = s
  const mine = s.selections.find((sel) => sel.uid === uid.value)
  original.value = mine?.dishIds ?? []
  picked.value = new Set(original.value)
  note.value = mine?.note ?? ''
})

/** 别的家人也点了这道菜 */
function othersHint(id: string): string {
  const who = (slot.value?.selections ?? [])
    .filter((sel) => sel.uid !== uid.value && sel.dishIds.includes(id))
    .map((sel) => sel.name)
    .join('、')
  return who ? `${who} 也想吃` : ''
}

function toggle(id: string): void {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

async function submit(): Promise<void> {
  if (submitting.value) return
  if (!picked.value.size && !changed.value) {
    uni.showToast({ title: '先挑几道想吃的', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    await menuCo().submitSelection(date.value, meal.value, [...picked.value], note.value)
    uni.showToast({ title: picked.value.size ? '已提交' : '已取消', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    submitting.value = false
  }
}

function openDish(id: string): void {
  uni.navigateTo({ url: `/pages/dish/detail?id=${id}` })
}

function goCategories(): void {
  uni.navigateTo({ url: '/pages/categories/index' })
}

function goDishes(): void {
  uni.switchTab({ url: '/pages/dishes/index' })
}
</script>

<style lang="scss" scoped>
.order {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-surface);
}

.head {
  padding: var(--space-4);
  color: #fff;
  /* 顶边的颜色必须和导航栏（pages.json 里的 #4a6b7f）一致，往下再变深，否则会看见一条接缝 */
  background: linear-gradient(180deg, #4a6b7f 0%, #304d60 65%, #263f4f 100%);
}

.head-date {
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
}

.head-title {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.note {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 var(--space-3);
  font-size: 14px;
  background: var(--c-bg);
  border-radius: var(--radius-md);
}

.btn.small {
  display: inline-flex;
  min-height: 36px;
  margin-top: var(--space-3);
}
</style>
