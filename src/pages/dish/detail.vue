<template>
  <StateView :loading="loading" :error="error" @retry="load">
    <view v-if="dish" class="detail">
      <DishThumb class="hero" :name="dish.name" :photo="dish.photo" :size="390" />
      <view class="page body">
        <view>
          <view class="page-title">{{ dish.name }}</view>
          <view class="tags">
            <text v-if="dish.minutes" class="tag">{{ dish.minutes }} 分钟</text>
            <text v-for="t in dish.tags" :key="t" class="tag">{{ t }}</text>
            <text class="tag">吃过 {{ dish.timesEaten }} 次</text>
          </view>
        </view>

        <view v-if="dish.ingredients.length">
          <view class="section-title">食材</view>
          <view class="card ingredients">
            <view v-for="i in dish.ingredients" :key="i.name" class="ingredient">
              <text>{{ i.name }}</text>
              <text class="muted">{{ i.qty }}</text>
            </view>
          </view>
        </view>

        <view v-if="dish.steps.length">
          <view class="section-title">做法</view>
          <view v-for="(s, idx) in dish.steps" :key="idx" class="step">
            <text class="step-no">{{ idx + 1 }}</text>
            <text>{{ s }}</text>
          </view>
        </view>
      </view>

      <view class="bar">
        <wd-button plain icon="edit" @click="edit" />
        <wd-button block custom-style="flex: 1" @click="addToMenu">加入{{ mealName }}菜单</wd-button>
      </view>
    </view>
  </StateView>
</template>

<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import DishThumb from '@/components/DishThumb.vue'
import StateView from '@/components/StateView.vue'
import { useSessionStore } from '@/stores/session'
import { type Dish, MEALS } from '@/types/models'

const { date, meal } = storeToRefs(useSessionStore())
const id = ref('')
const dish = ref<Dish | null>(null)
const loading = ref(true)
const error = ref('')
const mealName = computed(() => MEALS.find((m) => m.value === meal.value)?.label)

async function load(): Promise<void> {
  error.value = ''
  try {
    dish.value = await menuCo().getDish(id.value)
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

onLoad((query) => {
  id.value = String(query?.id ?? '')
})
onShow(load)

async function addToMenu(): Promise<void> {
  try {
    const menu = await menuCo().getMenu(date.value, meal.value)
    if (!menu.items.some((it) => it.dishId === id.value)) {
      await menuCo().toggleOrder(date.value, meal.value, id.value)
    }
    uni.showToast({ title: '已加入', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

function edit(): void {
  uni.navigateTo({ url: `/pages/dish/edit?id=${id.value}` })
}
</script>

<style lang="scss" scoped>
.hero {
  width: 100% !important;
  height: 280px !important;
  border-radius: 0 !important;
}

.body {
  padding-bottom: 96px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.tag {
  padding: 2px 10px;
  background: var(--c-surface);
  border-radius: var(--radius-pill);
  font-size: 13px;
}

.section-title {
  margin-bottom: var(--space-2);
  font-size: 17px;
  font-weight: 700;
}

.ingredients {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--space-5);
  padding: var(--space-1) var(--space-4);
}

.ingredient {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--c-line);
}

.step {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  line-height: 1.6;
}

.step-no {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: var(--c-accent);
  font-size: 13px;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
  background: var(--c-accent-soft);
  border-radius: 50%;
}

.bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5) calc(var(--space-3) + env(safe-area-inset-bottom));
  background: var(--c-surface);
  border-top: 1px solid var(--c-line);
}
</style>
