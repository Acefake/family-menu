<template>
  <view class="page">
    <view>
      <view class="page-title">编辑分类</view>
      <view class="muted">改名、调顺序、增删都行。删掉的分类里的菜会自动挪到「其他」。</view>
    </view>

    <StateView :loading="loading" :error="error" @retry="reload">
      <view class="card list">
        <view v-for="(c, i) in items" :key="c.key" class="row hairline">
          <input
            :value="c.name"
            class="name"
            maxlength="6"
            placeholder="分类名"
            @input="setName(i, $event)"
            @blur="setName(i, $event)"
          />
          <text :class="['act', { off: i === 0 }]" @click="move(i, -1)">↑</text>
          <text :class="['act', { off: i === items.length - 1 }]" @click="move(i, 1)">↓</text>
          <text class="act del" @click="remove(i)">删除</text>
        </view>
      </view>

      <view v-if="items.length < MAX" class="btn plain" @click="add">＋ 新分类</view>
    </StateView>

    <view class="bar">
      <view :class="['btn grow', { disabled: saving }]" @click="save">保存</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import { useSessionStore } from '@/stores/session'

const MAX = 12

interface Item {
  /** 列表渲染用的稳定 key，和后端的分类 ID 无关 */
  key: number
  id?: string
  name: string
}

const session = useSessionStore()
const { family } = storeToRefs(session)
const items = ref<Item[]>([])
const saving = ref(false)
let seq = 0

const { loading, error, reload } = usePageData(async () => {
  items.value = (family.value?.categories ?? []).map((c) => ({ key: seq++, id: c.id, name: c.name }))
})

/** 小程序里 v-model 在 v-for 的输入框上不一定及时同步，这里按行号显式写回 */
function setName(index: number, event: { detail: { value: string } }): void {
  const item = items.value[index]
  if (item) item.name = event.detail.value
}

function add(): void {
  items.value = [...items.value, { key: seq++, name: '' }]
}

function move(index: number, delta: -1 | 1): void {
  const target = index + delta
  if (target < 0 || target >= items.value.length) return
  const next = [...items.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  items.value = next
}

async function remove(index: number): Promise<void> {
  if (items.value.length <= 1) {
    uni.showToast({ title: '至少留一个分类', icon: 'none' })
    return
  }
  const item = items.value[index]
  if (item.id) {
    const { confirm } = await uni.showModal({
      title: `删除「${item.name || '这个分类'}」？`,
      content: '里面的菜会挪到「其他」',
    })
    if (!confirm) return
  }
  items.value = items.value.filter((_, i) => i !== index)
}

async function save(): Promise<void> {
  if (saving.value) return
  const list = items.value.map((c) => ({ id: c.id, name: c.name.trim() }))
  const blank = list.findIndex((c) => !c.name)
  if (blank >= 0) {
    uni.showToast({ title: `第 ${blank + 1} 个分类还没有名字`, icon: 'none' })
    return
  }
  saving.value = true
  try {
    await menuCo().saveCategories(list)
    await session.refreshFamily()
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: 110px;
}

.list {
  padding: 0 var(--space-4);
}

.row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) 0;
}

.name {
  flex: 1;
  min-width: 0;
  height: 44px;
  font-size: 16px;
}

.act {
  padding: var(--space-2);
  color: var(--c-accent);
  font-size: 16px;

  &.off {
    color: var(--c-line-strong);
  }

  &.del {
    color: var(--c-danger);
    font-size: 14px;
  }
}

.grow {
  flex: 1;
}
</style>
