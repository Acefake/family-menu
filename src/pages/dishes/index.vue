<template>
  <view class="page">
    <view class="head">
      <view>
        <view class="page-title">菜谱</view>
        <view class="muted">共 {{ dishes.length }} 道 · 常吃的在前</view>
      </view>
      <wd-button icon="add" @click="addDish">添加</wd-button>
    </view>

    <NoFamily v-if="noFamily" />
    <StateView v-else :loading="loading" :error="error" @retry="reload">
      <view v-if="!dishes.length" class="state">还没有菜，先添加几道家里的拿手菜</view>
      <view v-for="g in groups" :key="g.value" class="group">
        <view class="muted group-title">{{ g.label }} · {{ g.items.length }}</view>
        <view class="card">
          <view v-for="d in g.items" :key="d._id" class="row" @click="openDish(d._id)">
            <DishThumb :name="d.name" :photo="d.photo" :size="48" />
            <view class="row-main">
              <text class="row-name">{{ d.name }}</text>
              <text class="muted"
                >吃过 {{ d.timesEaten }} 次{{ d.lastEatenAt ? ` · ${ago(d.lastEatenAt)}` : '' }}</text
              >
            </view>
            <text class="muted">›</text>
          </view>
        </view>
      </view>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { menuCo } from '@/api/menu'
import DishThumb from '@/components/DishThumb.vue'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { CATEGORIES, type Dish } from '@/types/models'

const dishes = ref<Dish[]>([])

const groups = computed(() =>
  CATEGORIES.map((c) => ({
    ...c,
    items: dishes.value.filter((d) => d.category === c.value).sort((a, b) => b.timesEaten - a.timesEaten),
  })).filter((g) => g.items.length)
)

const { loading, error, noFamily, reload } = usePageData(async () => {
  dishes.value = await menuCo().listDishes()
})

function ago(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  return days <= 0 ? '今天' : `${days} 天前`
}

function openDish(id: string): void {
  uni.navigateTo({ url: `/pages/dish/detail?id=${id}` })
}

function addDish(): void {
  uni.navigateTo({ url: '/pages/dish/edit' })
}
</script>

<style lang="scss" scoped>
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.group {
  margin-bottom: var(--space-5);
}

.group-title {
  margin-bottom: var(--space-2);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);

  & + & {
    border-top: 1px solid var(--c-line);
  }
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.row-name {
  font-size: 16px;
  font-weight: 500;
}
</style>
