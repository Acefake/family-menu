<template>
  <view class="page">
    <view class="page-title">想吃什么？</view>
    <wd-search v-model="keyword" placeholder="搜菜名或食材" hide-cancel />
    <wd-tabs v-model="category" slidable="always">
      <wd-tab v-for="c in categoryTabs" :key="c.value" :title="c.label" :name="c.value" />
    </wd-tabs>

    <NoFamily v-if="noFamily" />
    <StateView v-else :loading="loading" :error="error" @retry="reload">
      <view v-if="!filtered.length" class="state">没有匹配的菜，去「菜谱」添加</view>
      <view class="grid">
        <view v-for="d in filtered" :key="d._id" :class="['dish card', { picked: picked.has(d._id) }]">
          <DishThumb :name="d.name" :photo="d.photo" :size="150" />
          <view class="dish-foot">
            <view class="dish-text">
              <text class="dish-name">{{ d.name }}</text>
              <text class="muted">{{ d.minutes ? `${d.minutes} 分钟` : CATEGORY_LABEL[d.category] }}</text>
            </view>
            <wd-button
              size="small"
              :type="picked.has(d._id) ? 'primary' : 'info'"
              :icon="picked.has(d._id) ? 'check' : 'add'"
              @click="toggle(d._id)"
            />
          </view>
        </view>
      </view>
    </StateView>

    <view class="bar">
      <text>已点 {{ picked.size }} 道 · {{ mealName }}</text>
      <wd-button @click="goToday">去看菜单</wd-button>
    </view>
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
import { CATEGORIES, type Dish, type DishCategory, MEALS, type Menu } from '@/types/models'

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<
  DishCategory,
  string
>

const { date, meal } = storeToRefs(useSessionStore())
const dishes = ref<Dish[]>([])
const menu = ref<Menu | null>(null)
const keyword = ref('')
const category = ref<DishCategory | 'all'>('all')

const categoryTabs = [{ value: 'all', label: '全部' }, ...CATEGORIES]
const mealName = computed(() => MEALS.find((m) => m.value === meal.value)?.label)
const picked = computed(() => new Set((menu.value?.items ?? []).map((it) => it.dishId)))

const filtered = computed(() => {
  const kw = keyword.value.trim()
  return dishes.value.filter(
    (d) =>
      (category.value === 'all' || d.category === category.value) &&
      (!kw || d.name.includes(kw) || d.ingredients.some((i) => i.name.includes(kw)))
  )
})

const { loading, error, noFamily, reload } = usePageData(async () => {
  const [list, m] = await Promise.all([menuCo().listDishes(), menuCo().getMenu(date.value, meal.value)])
  dishes.value = list
  menu.value = m
})

async function toggle(dishId: string): Promise<void> {
  try {
    menu.value = await menuCo().toggleOrder(date.value, meal.value, dishId)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

function goToday(): void {
  uni.switchTab({ url: '/pages/today/index' })
}
</script>

<style lang="scss" scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  padding-bottom: 72px;
}

.dish {
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--c-line);

  &.picked {
    box-shadow: inset 0 0 0 2px var(--c-accent);
  }

  :deep(.thumb) {
    width: 100% !important;
    height: 104px !important;
    border-radius: 0;
  }
}

.dish-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
}

.dish-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dish-name {
  font-size: 16px;
  font-weight: 500;
}

.bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  background: var(--c-surface);
  border-top: 1px solid var(--c-line);
  font-weight: 700;
}
</style>
