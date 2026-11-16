<template>
  <StateView :loading="loading" :error="error" @retry="load">
    <view v-if="dish" class="detail">
      <DishThumb class="dish-photo" :name="dish.name" :photo="dish.photo" :size="390" />
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
        <view class="btn plain" @click="edit">编辑</view>
        <view :class="['btn grow', { disabled: adding }]" @click="addToMenu">{{
          added ? '已在我点的菜里' : `加入${relativeDay(date)}${mealName}`
        }}</view>
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
import { relativeDay } from '@/utils/date'

const { date, meal, uid } = storeToRefs(useSessionStore())
const added = ref(false)
const adding = ref(false)
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
  if (adding.value || added.value) return
  adding.value = true
  try {
    const slot = await menuCo().getSlot(date.value, meal.value)
    const mine = slot.selections.find((sel) => sel.uid === uid.value)
    const ids = mine?.dishIds ?? []
    if (!ids.includes(id.value)) {
      await menuCo().submitSelection(date.value, meal.value, [...ids, id.value], mine?.note)
    }
    added.value = true
    uni.showToast({ title: '已加入', icon: 'success' })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    adding.value = false
  }
}

function edit(): void {
  uni.navigateTo({ url: `/pages/dish/edit?id=${id.value}` })
}
</script>

<style lang="scss" scoped>
.dish-photo {
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
  font-size: 13px;
  color: var(--c-text-2);
  background: var(--c-muted-bg);
  border-radius: var(--radius-pill);
}

.section-title {
  margin-bottom: var(--space-2);
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 700;
}

.grow {
  flex: 1;
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
