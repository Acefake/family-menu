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
        :refreshable="true"
        :refreshing="refreshing"
        @open="openDish"
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
import type { Dish } from '@/types/models'

useTabBar(1)
const listTop = ref(0)

const { family } = storeToRefs(useSessionStore())
const dishes = ref<Dish[]>([])
const importing = ref(false)

const categories = computed(() => family.value?.categories ?? [])

const { loading, error, noFamily, reload } = usePageData(async () => {
  dishes.value = await menuCo().listDishes()
})

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
