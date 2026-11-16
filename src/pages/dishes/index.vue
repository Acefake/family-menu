<template>
  <view class="dishes with-tabbar">
    <view class="head">
      <view>
        <view class="head-date">{{ dishes.length }} 道 · 做得多的在前</view>
        <view class="head-title">我家菜谱</view>
      </view>
      <view class="add" @click="addDish">＋ 新菜</view>
    </view>

    <NoFamily v-if="noFamily" />
    <StateView v-else :loading="loading" :error="error" @retry="reload">
      <DishBrowser :dishes="dishes" :categories="categories" @open="openDish" @manage="goCategories">
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
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useTabBar } from '@/composables/use-tab-bar'
import { useSessionStore } from '@/stores/session'
import type { Dish } from '@/types/models'

useTabBar(1)

const { family } = storeToRefs(useSessionStore())
const dishes = ref<Dish[]>([])
const importing = ref(false)

const categories = computed(() => family.value?.categories ?? [])

const { loading, error, noFamily, reload } = usePageData(async () => {
  dishes.value = await menuCo().listDishes()
})

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

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
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

.add {
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
