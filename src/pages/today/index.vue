<template>
  <view class="page">
    <view>
      <view class="muted">{{ dayLabel }}</view>
      <view class="page-title">这顿吃这些</view>
    </view>

    <wd-segmented v-model:value="mealLabel" :options="mealLabels" @change="reload" />

    <NoFamily v-if="noFamily" />
    <StateView v-else :loading="loading" :error="error" @retry="reload">
      <view class="summary">
        <text>{{ items.length }} 道菜 · 已做好 {{ doneCount }} 道</text>
        <wd-button size="small" plain @click="pickRandom">随便来一道</wd-button>
      </view>

      <view v-if="!items.length" class="state">还没点菜，去「点菜」挑几道吧</view>
      <view v-for="item in items" :key="item.dishId" class="row card">
        <DishThumb :name="item.dish?.name ?? '?'" :photo="item.dish?.photo" />
        <view class="row-main" @click="openDish(item.dishId)">
          <text :class="['row-name', { done: item.done }]">{{ item.dish?.name ?? '已删除的菜' }}</text>
          <text class="muted">{{ memberName(item.orderedBy) }}点的</text>
        </view>
        <wd-checkbox :model-value="item.done" shape="circle" @change="toggleDone(item.dishId, !item.done)" />
      </view>

      <view class="shopping card" @click="openShopping">
        <text>采购清单</text>
        <text class="muted">按菜自动合并食材 ›</text>
      </view>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import DishThumb from '@/components/DishThumb.vue'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'
import { type Dish, MEALS, type Menu } from '@/types/models'
import { formatDay } from '@/utils/date'

const session = useSessionStore()
const { date, meal, family } = storeToRefs(session)
const menu = ref<Menu | null>(null)
const dishes = ref<Dish[]>([])

const mealLabels = MEALS.map((m) => m.label)
const mealLabel = computed({
  get: () => MEALS.find((m) => m.value === meal.value)?.label ?? '晚饭',
  set: (label: string) => {
    meal.value = MEALS.find((m) => m.label === label)?.value ?? 'dinner'
  },
})
const dayLabel = computed(() => formatDay(date.value))

const items = computed(() =>
  (menu.value?.items ?? []).map((it) => ({ ...it, dish: dishes.value.find((d) => d._id === it.dishId) }))
)
const doneCount = computed(() => items.value.filter((it) => it.done).length)

const { loading, error, noFamily, reload } = usePageData(async () => {
  const [m, list] = await Promise.all([menuCo().getMenu(date.value, meal.value), menuCo().listDishes()])
  menu.value = m
  dishes.value = list
})

function memberName(uid: string): string {
  return family.value?.members.find((m) => m.uid === uid)?.nickname ?? '家人'
}

async function toggleDone(dishId: string, done: boolean): Promise<void> {
  try {
    menu.value = await menuCo().setDone(date.value, meal.value, dishId, done)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

/** 从没点过的菜里随机挑一道加入菜单，优先最近没吃过的 */
async function pickRandom(): Promise<void> {
  const ordered = new Set(items.value.map((it) => it.dishId))
  const pool = dishes.value
    .filter((d) => !ordered.has(d._id))
    .sort((a, b) => (a.lastEatenAt ?? 0) - (b.lastEatenAt ?? 0))
    .slice(0, 5)
  if (!pool.length) {
    uni.showToast({ title: '菜谱里没有可选的菜了', icon: 'none' })
    return
  }
  const dish = pool[Math.floor(Math.random() * pool.length)]
  try {
    menu.value = await menuCo().toggleOrder(date.value, meal.value, dish._id)
    uni.showToast({ title: `加了：${dish.name}`, icon: 'none' })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

function openDish(id: string): void {
  uni.navigateTo({ url: `/pages/dish/detail?id=${id}` })
}

function openShopping(): void {
  uni.navigateTo({ url: '/pages/shopping/index' })
}
</script>

<style lang="scss" scoped>
.summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
  font-weight: 500;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-3);
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.row-name {
  font-size: 17px;
  font-weight: 500;

  &.done {
    color: var(--c-text-2);
    text-decoration: line-through;
  }
}

.shopping {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: var(--c-accent-soft);
}
</style>
