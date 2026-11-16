<template>
  <view class="page">
    <view class="head">
      <view>
        <view class="page-title">采购清单</view>
        <view class="muted">已买 {{ boughtCount }}/{{ items.length }}</view>
      </view>
      <wd-button plain size="small" open-type="share">发给家人</wd-button>
    </view>
    <wd-progress :percentage="percent" hide-text />

    <StateView :loading="loading" :error="error" @retry="reload">
      <view v-if="!items.length" class="state">这顿的菜还没有填食材</view>
      <view class="card">
        <view v-for="it in items" :key="it.name" class="row" @click="toggle(it.name, !it.bought)">
          <wd-checkbox :model-value="it.bought" />
          <view class="row-main">
            <text :class="['row-name', { done: it.bought }]">{{ it.name }}</text>
            <text class="muted">{{ it.fromDishes.join('、') }}</text>
          </view>
          <text class="muted">{{ it.qty.join(' + ') }}</text>
        </view>
      </view>
    </StateView>
  </view>
</template>

<script setup lang="ts">
import { onShareAppMessage } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'
import type { ShoppingItem } from '@/types/models'

const { date, meal } = storeToRefs(useSessionStore())
const items = ref<ShoppingItem[]>([])
const boughtCount = computed(() => items.value.filter((it) => it.bought).length)
const percent = computed(() =>
  items.value.length ? Math.round((boughtCount.value / items.value.length) * 100) : 0
)

const { loading, error, reload } = usePageData(async () => {
  items.value = await menuCo().getShopping(date.value, meal.value)
})

async function toggle(name: string, bought: boolean): Promise<void> {
  const it = items.value.find((i) => i.name === name)
  if (it) it.bought = bought
  try {
    await menuCo().setBought(date.value, meal.value, name, bought)
  } catch (err) {
    if (it) it.bought = !bought
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

onShareAppMessage(() => ({ title: '帮忙买一下这些菜', path: '/pages/shopping/index' }))
</script>

<style lang="scss" scoped>
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) var(--space-4);

  & + & {
    border-top: 1px solid var(--c-line);
  }
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row-name {
  font-size: 16px;
  font-weight: 500;

  &.done {
    color: var(--c-text-2);
    font-weight: 400;
    text-decoration: line-through;
  }
}
</style>
