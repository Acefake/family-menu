<template>
  <view class="with-tabbar">
    <NavHero :title="title" :sub="dayLabel" art="bowl" :scroll="scrollTop" :refreshing="refreshing">
      <view class="meals">
        <view
          v-for="m in MEALS"
          :key="m.value"
          :class="['meal', { on: meal === m.value }]"
          @click="pickMeal(m.value)"
        >
          {{ m.label }}
        </view>
      </view>
    </NavHero>

    <view :class="['sheet', { 'has-bar': rows.length && !noFamily }]">
      <scroll-view scroll-x enhanced :show-scrollbar="false" class="strip">
        <view class="strip-inner">
          <view
            v-for="d in days"
            :key="d.date"
            :class="['day', { on: date === d.date }]"
            @click="pickDate(d.date)"
          >
            <text class="day-label">{{ d.label }}</text>
            <text class="day-num">{{ d.day }}</text>
            <text :class="['dot', { has: dayHasDishes(d.date) }]" />
          </view>
        </view>
      </scroll-view>

      <NoFamily v-if="noFamily" />
      <StateView v-else :loading="loading" :error="error" @retry="reload">
        <view class="status">
          <view class="tags">
            <text class="tag">{{ relativeDay(date) }}</text>
            <text class="tag meal-tag">{{ MEAL_LABEL[meal] }}</text>
            <text :class="['tag', statusTone]">{{ statusText }}</text>
          </view>
          <view class="status-right">
            <text v-if="rows.length" class="muted">{{ rows.length }} 道菜</text>
            <text v-if="slot?.status === 'served'" class="danger-link" @click="removeServed">删除记录</text>
          </view>
        </view>

        <EmptyState
          v-if="!rows.length"
          art="bowl"
          title="这顿还没人点菜"
          desc="家里每个人都可以点自己想吃的，会自动合成一张单"
        />

        <view v-for="row in rows" :key="row.dish._id" class="row hairline" @click="openDish(row.dish._id)">
          <DishThumb :name="row.dish.name" :photo="row.dish.photo" :size="64" />
          <view class="row-main">
            <text class="row-name">{{ row.dish.name }}</text>
            <view class="row-meta">
              <text :class="['tag', categoryTone(row.dish.category)]">{{
                categoryName(categories, row.dish.category)
              }}</text>
              <text v-if="row.dish.minutes" class="muted">{{ row.dish.minutes }} 分钟</text>
            </view>
            <text class="muted who">{{ row.who }} 想吃</text>
          </view>
          <text v-if="row.cooked" class="tag done">做了</text>
          <view
            v-else-if="slot?.status !== 'served'"
            class="remove"
            aria-label="拿掉这道菜"
            @click.stop="removeRow(row)"
          >
            ✕
          </view>
        </view>

        <view v-if="notes.length" class="notes">
          <text v-for="n in notes" :key="n" class="muted">{{ n }}</text>
        </view>

        <view v-if="slot?.status !== 'served'" class="actions">
          <view class="btn plain grow" @click="goOrder">{{
            myPicks.length ? '改我点的菜' : '我也点几道'
          }}</view>
          <view v-if="!rows.length" class="btn plain grow" @click="pickRandom">随便来一道</view>
        </view>
      </StateView>
    </view>

    <view v-if="rows.length && !noFamily" class="bar above-tabbar">
      <view v-if="slot?.status !== 'served'" class="btn plain" @click="goShopping">备菜清单</view>
      <view v-if="slot?.status === 'open'" class="btn grow" @click="confirm">确认这餐</view>
      <block v-else-if="slot?.status === 'confirmed'">
        <view class="btn plain" @click="reopen">再改改</view>
        <view class="btn grow" @click="goServe">记下这餐</view>
      </block>
      <block v-else>
        <view class="btn plain" @click="goDiary">看饮食日记</view>
        <view class="btn grow" @click="editServed">编辑记录</view>
      </block>
    </view>
  </view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import DishThumb from '@/components/DishThumb.vue'
import EmptyState from '@/components/EmptyState.vue'
import NavHero from '@/components/NavHero.vue'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useScrollTop } from '@/composables/use-scroll-top'
import { setTabBadge, useTabBar } from '@/composables/use-tab-bar'
import { useSessionStore } from '@/stores/session'
import {
  categoryName,
  categoryTone,
  type Dish,
  MEAL_LABEL,
  MEALS,
  type Meal,
  type Slot,
} from '@/types/models'
import { addDays, dayStrip, formatDay, relativeDay, today, weekdayName } from '@/utils/date'

useTabBar(0)
const scrollTop = useScrollTop()

const STRIP_DAYS = 7

const session = useSessionStore()
const { date, meal, uid, family } = storeToRefs(session)
const categories = computed(() => family.value?.categories ?? [])
const slot = ref<Slot | null>(null)
const dishes = ref<Dish[]>([])
const strip = ref<Slot[]>([])

const days = computed(() => dayStrip(today(), STRIP_DAYS))
const dayLabel = computed(() => formatDay(date.value))
/** 今天 / 明天 / 周四吃什么？；具体日期在标题上面的小字里，这里不重复 */
const title = computed(() => {
  if (date.value === today()) return '今天吃什么？'
  if (date.value === addDays(today(), 1)) return '明天吃什么？'
  return `${weekdayName(date.value)}吃什么？`
})

function dayHasDishes(d: string): boolean {
  return strip.value.some((s) => s.date === d && s.selections.some((sel) => sel.dishIds.length))
}

const rows = computed(() => {
  const byId = new Map(dishes.value.map((d) => [d._id, d]))
  const order: string[] = []
  const who = new Map<string, string[]>()
  const others = new Map<string, string[]>()
  for (const sel of slot.value?.selections ?? []) {
    for (const id of sel.dishIds) {
      if (!byId.has(id)) continue
      if (!who.has(id)) {
        who.set(id, [])
        others.set(id, [])
        order.push(id)
      }
      who.get(id)?.push(sel.uid === uid.value ? '我' : sel.name)
      if (sel.uid !== uid.value) others.get(id)?.push(sel.name)
    }
  }
  const cooked = new Set(slot.value?.cooked ?? [])
  return order.map((id) => ({
    dish: byId.get(id) as Dish,
    who: (who.get(id) ?? []).join('、'),
    others: others.get(id) ?? [],
    cooked: cooked.has(id),
  }))
})

const myPicks = computed(() => slot.value?.selections.find((s) => s.uid === uid.value)?.dishIds ?? [])
const notes = computed(() =>
  (slot.value?.selections ?? []).filter((s) => s.note).map((s) => `${s.name}：${s.note}`)
)

const statusText = computed(() => {
  if (slot.value?.status === 'served') return '已开饭'
  if (slot.value?.status === 'confirmed') return `${slot.value.confirmedBy ?? '掌勺'}已确认`
  return rows.value.length ? '等确认' : '还没点'
})
const statusTone = computed(() => {
  if (slot.value?.status === 'served' || slot.value?.status === 'confirmed') return 'done'
  return rows.value.length ? 'warn' : ''
})

async function loadSlot(): Promise<void> {
  const [s, list] = await Promise.all([menuCo().getSlot(date.value, meal.value), menuCo().listDishes()])
  slot.value = s
  dishes.value = list
}

async function loadStrip(): Promise<void> {
  const start = today()
  strip.value = await menuCo().listSlots(start, addDays(start, STRIP_DAYS - 1))
  // 底部 Tab 角标：今天还没开饭的菜一共几道
  const count = strip.value
    .filter((s) => s.date === start && s.status !== 'served')
    .reduce((sum, s) => sum + new Set(s.selections.flatMap((sel) => sel.dishIds)).size, 0)
  setTabBadge(0, count ? String(count) : '')
}

const { loading, error, noFamily, refreshing, reload } = usePageData(async () => {
  await Promise.all([loadSlot(), loadStrip()])
})

function pickMeal(value: Meal): void {
  meal.value = value
  void run(loadSlot)
}

function pickDate(value: string): void {
  date.value = value
  void run(loadSlot)
}

async function run(task: () => Promise<unknown>): Promise<void> {
  try {
    await task()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}

async function confirm(): Promise<void> {
  await run(async () => {
    slot.value = await menuCo().confirmSlot(date.value, meal.value)
    uni.showToast({ title: '已确认，可以备菜了', icon: 'none' })
  })
}

async function reopen(): Promise<void> {
  await run(async () => {
    slot.value = await menuCo().reopenSlot(date.value, meal.value)
  })
}

/** 从还没点过的菜里挑最久没吃的几道随机来一道，加进我点的 */
async function pickRandom(): Promise<void> {
  const taken = new Set(rows.value.map((r) => r.dish._id))
  const pool = dishes.value
    .filter((d) => !taken.has(d._id))
    .sort((a, b) => (a.lastEatenAt ?? 0) - (b.lastEatenAt ?? 0))
    .slice(0, 5)
  if (!pool.length) {
    uni.showToast({ title: '菜谱里没有可选的菜了', icon: 'none' })
    return
  }
  const dish = pool[Math.floor(Math.random() * pool.length)]
  await run(async () => {
    slot.value = await menuCo().submitSelection(date.value, meal.value, [...myPicks.value, dish._id])
    uni.showToast({ title: `加了：${dish.name}`, icon: 'none' })
    await loadStrip()
  })
}

/** 快捷删除：只有我点的就直接拿掉；还有别人点的，先问一句 */
async function removeRow(row: { dish: Dish; others: string[] }): Promise<void> {
  if (row.others.length) {
    const { confirm } = await uni.showModal({
      title: `把「${row.dish.name}」拿掉？`,
      content: `${row.others.join('、')} 也点了这道菜，拿掉后他们的单里也没有了`,
      confirmText: '拿掉',
    })
    if (!confirm) return
  }
  await run(async () => {
    slot.value = await menuCo().removeFromSlot(date.value, meal.value, row.dish._id)
    uni.showToast({ title: `已拿掉${row.dish.name}`, icon: 'none' })
    await loadStrip()
  })
}

function openDish(id: string): void {
  uni.navigateTo({ url: `/pages/dish/detail?id=${id}` })
}

function goOrder(): void {
  uni.navigateTo({ url: '/pages/order/index' })
}

function goShopping(): void {
  uni.switchTab({ url: '/pages/shopping/index' })
}

function goServe(): void {
  uni.navigateTo({ url: '/pages/serve/index' })
}

/** 改已开饭这一顿的记录：做了哪些菜、评分、整桌照 */
function editServed(): void {
  uni.navigateTo({ url: `/pages/serve/index?date=${date.value}&meal=${meal.value}` })
}

/** 删除已开饭的记录：这顿回到「已确认」，点过的菜还在 */
async function removeServed(): Promise<void> {
  const { confirm } = await uni.showModal({
    title: '删除这条记录？',
    content: '这顿会回到「已确认」，点过的菜还在，之后可以重新记；菜谱里的“吃过几次”也会退回。',
    confirmText: '删除',
  })
  if (!confirm) return
  await run(async () => {
    await menuCo().deleteServed(date.value, meal.value)
    await reload()
    uni.showToast({ title: '已删除', icon: 'success' })
  })
}

function goDiary(): void {
  uni.navigateTo({ url: '/pages/diary/index' })
}
</script>

<style lang="scss" scoped>
.meals {
  display: inline-flex;
  margin-top: var(--space-2);
  padding: 3px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-pill);
}

.meal {
  padding: 6px 20px;
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
  padding-bottom: 88px;
}

.strip {
  margin: 0 calc(var(--space-4) * -1) var(--space-3);
  white-space: nowrap;
}

.strip-inner {
  display: inline-flex;
  gap: var(--space-2);
  padding: 0 var(--space-4);
}

.day {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  padding: var(--space-2) 0;
  border-radius: var(--radius-md);

  &.on {
    background: var(--c-accent-soft);

    .day-num {
      color: var(--c-accent);
    }
  }
}

.day-label {
  color: var(--c-text-2);
  font-size: 12px;
}

.day-num {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.dot {
  width: 5px;
  height: 5px;
  margin-top: 2px;
  border-radius: 50%;

  &.has {
    background: var(--c-accent);
  }
}

.status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0 var(--space-3);
}

.tags {
  display: flex;
  gap: var(--space-2);
}

.status-right {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.danger-link {
  color: var(--c-danger);
  font-size: 13px;
}

.meal-tag {
  color: var(--tag-meat-ink);
  background: var(--tag-meat-bg);
}

.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
  padding: 40px 0 var(--space-5);
  text-align: center;
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
}

.row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) 0;
}

.remove {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--c-text-2);
  font-size: 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: 50%;

  &:active {
    color: var(--c-danger);
    border-color: var(--c-danger);
  }
}

.row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-name {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 700;
}

.row-meta {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: var(--c-bg);
  border-radius: var(--radius-md);
}

.actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.grow {
  flex: 1;
}
</style>
