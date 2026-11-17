<template>
  <view class="page">
    <view class="head">
      <view class="page-title">饮食日记</view>
      <view class="months">
        <text class="arrow" @click="shift(-1)">‹</text>
        <text class="month">{{ monthLabel }}</text>
        <text :class="['arrow', { off: isCurrent }]" @click="shift(1)">›</text>
      </view>
    </view>

    <StateView :loading="loading" :error="error" @retry="reload">
      <EmptyState
        v-if="!entries.length"
        art="diary"
        title="这个月还没有记录"
        desc="在「这顿」里确认后点「记下这餐」，就会留在这里"
      />

      <view v-for="e in entries" :key="e.id" class="entry">
        <view class="entry-date">
          <text class="entry-day">{{ e.day }}</text>
          <text class="muted">{{ e.month }}月</text>
        </view>
        <view class="entry-body">
          <view class="entry-head">
            <text class="entry-meal">{{ e.meal }}</text>
            <text v-if="e.people" class="muted">{{ e.people }}</text>
            <view class="entry-actions">
              <text class="act" @click="edit(e)">编辑</text>
              <text class="act danger" @click="remove(e)">删除</text>
            </view>
          </view>
          <image v-if="photoUrls[e.photo]" class="entry-photo" :src="photoUrls[e.photo]" mode="aspectFill" />
          <view class="entry-dishes">
            <view v-for="d in e.dishes" :key="d.id" class="dish" @click="openDish(d.id)">
              <DishThumb :name="d.name" :photo="d.photo" :size="76" />
              <text class="dish-name">{{ d.name }}</text>
              <text v-if="d.rating" class="dish-stars">{{ '★'.repeat(d.rating) }}</text>
            </view>
          </view>
        </view>
      </view>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import DishThumb from '@/components/DishThumb.vue'
import EmptyState from '@/components/EmptyState.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { type Dish, MEAL_LABEL, type Slot } from '@/types/models'
import { today } from '@/utils/date'
import { resolvePhoto } from '@/utils/photo'

const month = ref(today().slice(0, 7))
const slots = ref<Slot[]>([])
const dishes = ref<Dish[]>([])
/** 整桌照：cloud:// 文件 ID → 可显示的临时链接 */
const photoUrls = ref<Record<string, string>>({})

const monthLabel = computed(() => `${month.value.slice(0, 4)}年${Number(month.value.slice(5))}月`)
const isCurrent = computed(() => month.value >= today().slice(0, 7))

const MEAL_ORDER = ['dinner', 'lunch', 'breakfast']

const entries = computed(() => {
  const byId = new Map(dishes.value.map((d) => [d._id, d]))
  return [...slots.value]
    .sort((a, b) => b.date.localeCompare(a.date) || MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal))
    .map((s) => ({
      id: s._id ?? `${s.date}-${s.meal}`,
      date: s.date,
      mealKey: s.meal,
      month: Number(s.date.slice(5, 7)),
      day: s.date.slice(8, 10),
      meal: MEAL_LABEL[s.meal],
      photo: s.photo ?? '',
      people: [...new Set(s.selections.map((sel) => sel.name))].join('、'),
      dishes: (s.cooked ?? []).map((id) => ({
        id,
        name: byId.get(id)?.name ?? '已删除的菜',
        photo: byId.get(id)?.photo,
        rating: s.ratings?.[id] ?? 0,
      })),
    }))
})

const { loading, error, reload } = usePageData(async () => {
  const [list, dishList] = await Promise.all([menuCo().listServed(month.value), menuCo().listDishes()])
  slots.value = list
  dishes.value = dishList
  await loadPhotos(list)
})

async function loadPhotos(list: Slot[]): Promise<void> {
  const urls: Record<string, string> = {}
  await Promise.all(
    list
      .map((s) => s.photo)
      .filter((src): src is string => !!src)
      .map(async (src) => {
        urls[src] = await resolvePhoto(src).catch(() => '')
      })
  )
  photoUrls.value = urls
}

function shift(delta: number): void {
  if (delta > 0 && isCurrent.value) return
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  void reload()
}

type Entry = (typeof entries.value)[number]

/** 重新编辑这一顿：回到「记下这餐」页，带着当时记的内容 */
function edit(e: Entry): void {
  uni.navigateTo({ url: `/pages/serve/index?date=${e.date}&meal=${e.mealKey}` })
}

/** 删除这条记录：这顿回到「已确认」，点过的菜还在，可以再记一次 */
async function remove(e: Entry): Promise<void> {
  const { confirm } = await uni.showModal({
    title: '删除这条记录？',
    content: '这顿会回到「已确认」，点过的菜还在，之后可以重新记；菜谱里的“吃过几次”也会退回。',
    confirmText: '删除',
  })
  if (!confirm) return
  try {
    await menuCo().deleteServed(e.date, e.mealKey)
    uni.showToast({ title: '已删除', icon: 'success' })
    await reload()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

function openDish(id: string): void {
  uni.navigateTo({ url: `/pages/dish/detail?id=${id}` })
}
</script>

<style lang="scss" scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.months {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.month {
  font-size: 14px;
}

.arrow {
  padding: 0 var(--space-2);
  font-size: 22px;

  &.off {
    color: var(--c-line-strong);
  }
}

.entry {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--c-line);
}

.entry-date {
  display: flex;
  flex: 0 0 44px;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.entry-day {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 700;
}

.entry-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.entry-head {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
}

.entry-meal {
  font-weight: 600;
}

.entry-actions {
  display: flex;
  gap: var(--space-3);
  margin-left: auto;
}

.act {
  color: var(--c-accent);
  font-size: 13px;

  &.danger {
    color: var(--c-danger);
  }
}

.entry-photo {
  width: 100%;
  height: 160px;
  border-radius: var(--radius-md);
}

.entry-dishes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.dish {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 76px;
}

.dish-name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dish-stars {
  color: #d9a441;
  font-size: 11px;
  letter-spacing: 1px;
}
</style>
