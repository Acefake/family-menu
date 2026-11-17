<template>
  <view class="browser">
    <view class="search">
      <input v-model="keyword" class="search-input" placeholder="搜菜名、食材" confirm-type="search" />
    </view>

    <view v-if="!dishes.length" class="empty">
      <slot name="empty" />
    </view>

    <view v-else class="layout">
      <scroll-view scroll-y enhanced :show-scrollbar="false" class="rail">
        <view
          v-for="c in tabs"
          :key="c.id"
          :class="['rail-item', { on: current === c.id }]"
          @click="current = c.id"
        >
          {{ c.name }}
        </view>
        <view class="rail-edit" @click="emit('manage')">编辑分类</view>
      </scroll-view>

      <view class="right">
        <scroll-view v-if="subs.length" scroll-x enhanced :show-scrollbar="false" class="chips">
          <view class="chips-inner">
            <view :class="['chip', { on: !currentSub }]" @click="currentSub = ''">全部</view>
            <view
              v-for="s in subs"
              :key="s.id"
              :class="['chip', { on: currentSub === s.id }]"
              @click="currentSub = s.id"
            >
              {{ s.name }}
            </view>
          </view>
        </scroll-view>

        <scroll-view scroll-y enhanced :show-scrollbar="false" class="list">
          <view v-if="!visible.length" class="state">没有匹配的菜</view>
          <view v-for="d in visible" :key="d._id" class="row hairline">
            <DishThumb :name="d.name" :photo="d.photo" :size="68" @click="emit('open', d._id)" />
            <view class="row-main" @click="onRowTap(d._id)">
              <text class="row-name">{{ d.name }}</text>
              <view class="row-meta">
                <text :class="['tag', categoryTone(d.category)]">{{ dishCategoryText(d) }}</text>
                <text v-if="d.minutes" class="muted">{{ d.minutes }} 分钟</text>
              </view>
              <text v-if="hint?.(d._id)" class="muted">{{ hint(d._id) }}</text>
              <text v-else-if="!picked" class="muted">{{ eatenText(d) }}</text>
            </view>
            <view
              v-if="picked"
              :class="['round-btn', { on: picked.has(d._id) }]"
              @click="emit('toggle', d._id)"
            />
            <text v-else class="chev" @click="emit('open', d._id)">›</text>
          </view>
          <view class="list-end" />
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
// 小程序里组件外会多一层自定义元素，不去掉的话根节点的 flex: 1 撑不开高度
defineOptions({ options: { virtualHost: true } })
import { computed, ref, watch } from 'vue'

import DishThumb from '@/components/DishThumb.vue'
import { type Category, categoryName, categoryTone, type Dish, subCategoryName } from '@/types/models'

const ALL = 'all'

const props = defineProps<{
  dishes: Dish[]
  categories: Category[]
  /** 传了就是「点菜」模式：每行右边是加号 / 对勾；不传就是「浏览」模式：点一行进详情 */
  picked?: Set<string>
  /** 每行下面的补充说明，比如「爸爸也想吃」 */
  hint?: (id: string) => string
}>()

const emit = defineEmits<{
  open: [id: string]
  toggle: [id: string]
  manage: []
}>()

const keyword = ref('')
const current = ref<string>(ALL)
/** 空字符串 = 当前一级分类下的「全部」 */
const currentSub = ref('')

const tabs = computed(() => [{ id: ALL, name: '全部' }, ...props.categories])

/** 选中某个一级分类且它有二级分类时，列表顶部显示一排二级分类 */
const subs = computed(() => props.categories.find((c) => c.id === current.value)?.subs ?? [])

// 切换一级分类，或二级分类被改没了，都回到「全部」
watch([current, subs], () => {
  if (!subs.value.some((s) => s.id === currentSub.value)) currentSub.value = ''
})

const visible = computed(() => {
  const kw = keyword.value.trim()
  return props.dishes
    .filter(
      (d) =>
        (current.value === ALL || d.category === current.value) &&
        (!currentSub.value || d.subCategory === currentSub.value) &&
        (!kw || d.name.includes(kw) || d.ingredients.some((i) => i.name.includes(kw)))
    )
    .sort((a, b) => b.timesEaten - a.timesEaten)
})

function dishCategoryText(d: Dish): string {
  const sub = subCategoryName(props.categories, d.category, d.subCategory)
  const name = categoryName(props.categories, d.category)
  return sub ? `${name} · ${sub}` : name
}

function onRowTap(id: string): void {
  if (props.picked) emit('toggle', id)
  else emit('open', id)
}

function eatenText(d: Dish): string {
  if (!d.timesEaten) return '还没做过'
  const days = d.lastEatenAt ? Math.floor((Date.now() - d.lastEatenAt) / 86_400_000) : -1
  const ago = days < 0 ? '' : days === 0 ? ' · 今天' : ` · ${days} 天前`
  return `做过 ${d.timesEaten} 次${ago}`
}
</script>

<style lang="scss" scoped>
.browser {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.search {
  padding: var(--space-3) var(--space-4);
}

.search-input {
  height: 40px;
  padding: 0 var(--space-4);
  font-size: 14px;
  background: var(--c-bg);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
}

.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
  padding: 48px var(--space-4) var(--space-5);
  text-align: center;
}

.layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.rail {
  flex: 0 0 76px;
  height: 100%;
}

.rail-item {
  position: relative;
  padding: var(--space-3) var(--space-2);
  color: var(--c-text-2);
  font-size: 14px;
  text-align: center;
  border-radius: var(--radius-sm);

  &.on {
    color: var(--c-accent);
    font-weight: 600;
    background: var(--c-accent-soft);

    &::before {
      position: absolute;
      top: 14px;
      left: 0;
      width: 3px;
      height: 20px;
      background: var(--c-accent);
      border-radius: 2px;
      content: '';
    }
  }
}

.rail-edit {
  margin-top: var(--space-3);
  padding: var(--space-3) var(--space-2);
  color: var(--c-text-2);
  font-size: 12px;
  text-align: center;
  border-top: 1px solid var(--c-line);
}

.right {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chips {
  flex: 0 0 auto;
  padding: var(--space-1) var(--space-4) var(--space-2) var(--space-2);
  white-space: nowrap;
}

.chips-inner {
  display: inline-flex;
  gap: var(--space-2);
}

.chip {
  flex: 0 0 auto;
  padding: 4px 12px;
  color: var(--c-text-2);
  font-size: 13px;
  background: var(--c-bg);
  border-radius: 999px;

  &.on {
    color: var(--c-accent);
    font-weight: 600;
    background: var(--c-accent-soft);
  }
}

.list {
  flex: 1;
  min-height: 0;
  padding: 0 var(--space-4) 0 var(--space-2);
}

.row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) 0;
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
  font-size: 16px;
  font-weight: 700;
}

.row-meta {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.chev {
  padding: 0 var(--space-1);
  color: var(--c-line-strong);
  font-size: 20px;
}

.list-end {
  height: 130px;
}
</style>
