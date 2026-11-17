<template>
  <view class="dishes with-tabbar">
    <NavHero
      title="我家菜谱"
      :sub="`${dishes.length} 道 · 做得多的在前`"
      art="book"
      :scroll="listTop"
      :refreshing="refreshing"
      follow
    >
      <view class="add" @click="addDish">＋ 新菜</view>
    </NavHero>

    <NoFamily v-if="noFamily" />
    <StateView v-else :loading="loading" :error="error" @retry="reload">
      <DishBrowser
        :dishes="dishes"
        :categories="categories"
        :quick-picked="quickPicked"
        :disabled="ordering || slot?.status === 'served'"
        :refreshable="true"
        :refreshing="refreshing"
        @open="openDish"
        @toggle="quickOrder"
        @manage="goCategories"
        @refresh="onRefresh"
        @scroll="listTop = $event"
      >
        <template #empty>
          <EmptyState
            art="bowl"
            title="把爱吃的，放进我家菜谱"
            desc="可以先导入一批家常菜，再慢慢添自己的拿手菜"
          >
            <view class="actions">
              <view :class="['btn', { disabled: importing }]" @click="importHomeDishes">导入家常菜</view>
              <view class="btn plain" @click="addDish">添加拿手菜</view>
            </view>
          </EmptyState>
        </template>
      </DishBrowser>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import DishBrowser from '@/components/DishBrowser.vue'
import EmptyState from '@/components/EmptyState.vue'
import NavHero from '@/components/NavHero.vue'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useTabBar } from '@/composables/use-tab-bar'
import { useSessionStore } from '@/stores/session'
import type { Dish, Slot } from '@/types/models'
import { MEAL_LABEL } from '@/types/models'
import { relativeDay } from '@/utils/date'

useTabBar(1)
const listTop = ref(0)

const { family, uid, date, meal } = storeToRefs(useSessionStore())
const dishes = ref<Dish[]>([])
const slot = ref<Slot | null>(null)
const ordering = ref(false)
const quickPicked = computed(
  () => new Set(slot.value?.selections.find((s) => s.uid === uid.value)?.dishIds ?? [])
)
const importing = ref(false)

const categories = computed(() => family.value?.categories ?? [])

const { loading, error, noFamily, reload } = usePageData(async () => {
  const [list, current] = await Promise.all([menuCo().listDishes(), menuCo().getSlot(date.value, meal.value)])
  dishes.value = list
  slot.value = current
})

/** 即时更新当前餐次自己的选择，保留已点菜和留言，失败时不改变按钮状态。 */
async function quickOrder(id: string): Promise<void> {
  if (ordering.value) return
  ordering.value = true
  const selectedDate = date.value
  const selectedMeal = meal.value
  try {
    const current = await menuCo().getSlot(selectedDate, selectedMeal)
    if (current.status === 'served') {
      slot.value = current
      uni.showToast({ title: '这顿已经开饭，不能再点菜', icon: 'none' })
      return
    }
    const mine = current.selections.find((s) => s.uid === uid.value)
    const ids = new Set(mine?.dishIds ?? [])
    const removing = ids.has(id)
    if (removing) ids.delete(id)
    else ids.add(id)
    slot.value = await menuCo().submitSelection(selectedDate, selectedMeal, [...ids], mine?.note ?? '')
    uni.showToast({
      title: removing ? '已取消这道菜' : `已点到${relativeDay(selectedDate)}${MEAL_LABEL[selectedMeal]}`,
      icon: 'none',
    })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    ordering.value = false
  }
}

/** 列表下拉刷新：刷新完把状态还给列表，它的下拉区才会收回去 */
const refreshing = ref(false)
async function onRefresh(): Promise<void> {
  refreshing.value = true
  try {
    await reload()
  } finally {
    refreshing.value = false
  }
}

async function importHomeDishes(): Promise<void> {
  if (importing.value) return
  importing.value = true
  try {
    const added = await menuCo().importHomeDishes()
    uni.showToast({ title: added ? `已导入 ${added} 道菜` : '家常菜已在菜谱中', icon: 'none' })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    await reload()
    importing.value = false
  }
}

function openDish(id: string): void {
  uni.navigateTo({ url: `/pages/dish/detail?id=${id}` })
}

function addDish(): void {
  uni.navigateTo({ url: '/pages/dish/edit' })
}

function goCategories(): void {
  uni.navigateTo({ url: '/pages/categories/index' })
}
</script>

<style lang="scss" scoped>
.dishes {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-surface);
}

.add {
  display: inline-block;
  margin-top: var(--space-2);
  padding: 6px 14px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-pill);
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
</style>
