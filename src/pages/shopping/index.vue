<template>
  <view class="with-tabbar">
    <NavHero title="备菜清单" :sub="rangeLabel" art="basket" :scroll="scrollTop" :refreshing="refreshing">
      <view class="ranges">
        <view
          v-for="r in RANGES"
          :key="r.days"
          :class="['range', { on: days === r.days }]"
          @click="pickRange(r.days)"
        >
          {{ r.label }}
        </view>
      </view>
    </NavHero>

    <view :class="['sheet', { 'has-bar': shopping.items.length }]">
      <NoFamily v-if="noFamily" />
      <StateView v-else :loading="loading" :error="error" @retry="reload">
        <EmptyState
          v-if="!shopping.items.length && !shopping.stocked.length"
          art="basket"
          title="这几天还没有要买的"
          desc="先在「这顿」里点菜，食材会自动合并到这里"
        />

        <block v-else>
          <view class="progress">
            <text>已买 {{ boughtCount }}/{{ shopping.items.length }}</text>
            <view class="bar-track"><view class="bar-fill" :style="{ width: `${percent}%` }" /></view>
          </view>

          <view v-for="it in shopping.items" :key="it.name" class="item hairline" @click="toggle(it)">
            <view :class="['check', { on: it.bought }]">{{ it.bought ? '✓' : '' }}</view>
            <view class="item-main">
              <text :class="['item-name', { done: it.bought }]">{{ it.name }}</text>
              <text class="muted">{{ it.fromDishes.join('、') }}</text>
            </view>
            <text class="item-qty">{{ it.qty.join(' + ') }}</text>
            <view class="have" @click.stop="setPantry(it.name, true)">家里有</view>
          </view>

          <view v-if="shopping.stocked.length" class="stocked">
            <view class="stocked-head" @click="showStocked = !showStocked">
              <text>家里有的 {{ shopping.stocked.length }} 样，不用买</text>
              <text class="link">{{ showStocked ? '收起' : '展开' }}</text>
            </view>
            <view v-if="showStocked">
              <view v-for="it in shopping.stocked" :key="it.name" class="item hairline">
                <view class="item-main">
                  <text class="item-name">{{ it.name }}</text>
                </view>
                <text class="item-qty">{{ it.qty.join(' + ') }}</text>
                <view class="have" @click="setPantry(it.name, false)">用完了</view>
              </view>
            </view>
          </view>
        </block>
      </StateView>
    </view>

    <view v-if="shopping.items.length" class="bar">
      <view class="btn plain grow" @click="copyList">复制清单</view>
      <button class="btn grow share" open-type="share">发给家人</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShareAppMessage } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import EmptyState from '@/components/EmptyState.vue'
import NavHero from '@/components/NavHero.vue'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useScrollTop } from '@/composables/use-scroll-top'
import { useTabBar } from '@/composables/use-tab-bar'
import type { Shopping, ShoppingItem } from '@/types/models'
import { addDays, monthDay, today } from '@/utils/date'

useTabBar(2)
const scrollTop = useScrollTop()

const RANGES = [
  { days: 1, label: '今天' },
  { days: 2, label: '明天前' },
  { days: 3, label: '3 天' },
  { days: 7, label: '7 天' },
]

const days = ref(3)
const shopping = ref<Shopping>({ items: [], stocked: [] })
const showStocked = ref(false)

const from = computed(() => today())
const to = computed(() => addDays(from.value, days.value - 1))
const rangeLabel = computed(() =>
  days.value === 1 ? monthDay(from.value) : `${monthDay(from.value)} – ${monthDay(to.value)}`
)
const boughtCount = computed(() => shopping.value.items.filter((it) => it.bought).length)
const percent = computed(() =>
  shopping.value.items.length ? Math.round((boughtCount.value / shopping.value.items.length) * 100) : 0
)

const { loading, error, noFamily, refreshing, reload } = usePageData(async () => {
  shopping.value = await menuCo().getShopping(from.value, to.value)
})

function pickRange(value: number): void {
  days.value = value
  void reload()
}

async function toggle(it: ShoppingItem): Promise<void> {
  const next = !it.bought
  it.bought = next
  try {
    await menuCo().setBought(from.value, to.value, it.name, next)
  } catch (err) {
    it.bought = !next
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

async function setPantry(name: string, have: boolean): Promise<void> {
  try {
    await menuCo().setPantry(name, have)
    shopping.value = await menuCo().getShopping(from.value, to.value)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

function copyList(): void {
  const lines = shopping.value.items
    .filter((it) => !it.bought)
    .map((it) => `${it.name} ${it.qty.join('+')}`.trim())
  uni.setClipboardData({ data: `要买的：\n${lines.join('\n')}` })
}

onShareAppMessage(() => ({ title: '帮忙买一下这些菜', path: '/pages/shopping/index' }))
</script>

<style lang="scss" scoped>
.ranges {
  display: inline-flex;
  margin-top: var(--space-2);
  padding: 3px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-pill);
}

.range {
  padding: 6px 16px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  border-radius: var(--radius-pill);

  &.on {
    color: var(--c-accent);
    font-weight: 600;
    background: #fff;
  }
}

/* 只有底部操作条出现时才留出它的高度，空状态不留，不然页面比一屏高、能滚 */
.sheet.has-bar {
  padding-bottom: 110px;
}

.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
  padding: 48px 0;
  text-align: center;
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.progress {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding-bottom: var(--space-3);
  font-size: 13px;
  color: var(--c-text-2);
}

.bar-track {
  flex: 1;
  height: 4px;
  overflow: hidden;
  background: var(--c-line);
  border-radius: 2px;
}

.bar-fill {
  height: 100%;
  background: var(--c-done);
  border-radius: 2px;
  transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) 0;
}

.check {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: #fff;
  font-size: 13px;
  border: 1.5px solid var(--c-line-strong);
  border-radius: 50%;

  &.on {
    background: var(--c-done);
    border-color: var(--c-done);
  }
}

.item-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.item-name {
  font-size: 16px;

  &.done {
    color: var(--c-text-2);
    text-decoration: line-through;
  }
}

.item-qty {
  color: var(--c-text-2);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.have {
  padding: 2px var(--space-3);
  color: var(--c-text-2);
  font-size: 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-pill);
}

.stocked {
  margin-top: var(--space-4);
}

.stocked-head {
  display: flex;
  justify-content: space-between;
  padding: var(--space-3) 0;
  color: var(--c-text-2);
  font-size: 13px;
}

.link {
  color: var(--c-accent);
}

.grow {
  flex: 1;
}

.share {
  margin: 0;
  line-height: 44px;
}
</style>
