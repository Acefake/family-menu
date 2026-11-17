<template>
  <view class="page">
    <view v-if="!form._id" class="card section">
      <view class="section-hd">
        <text class="section-title">快捷录入</text>
        <text class="muted">写菜名或贴一段做法</text>
      </view>
      <textarea
        v-model="quickText"
        class="field"
        :class="{ focus: focusKey === 'quick' }"
        placeholder="比如：番茄炒蛋"
        :placeholder-style="PLACEHOLDER"
        :maxlength="800"
        auto-height
        @focus="focusKey = 'quick'"
        @blur="focusKey = ''"
      />
      <wd-button block plain :loading="drafting" @click="draft">AI 生成菜谱和图片</wd-button>
    </view>

    <view class="photo" @click="choosePhoto">
      <image v-if="photoUrl" class="photo-img" :src="photoUrl" mode="aspectFill" />
      <text v-if="!photoUrl" class="muted">{{
        uploading ? '上传中…' : generating ? '图片生成中…' : '点击添加照片'
      }}</text>
    </view>
    <wd-button block plain :loading="generating" @click="generatePhoto">AI 生成图片</wd-button>

    <wd-cell-group border>
      <wd-input v-model="form.name" label="菜名" placeholder="比如：可乐鸡翅" clearable />
      <wd-picker v-model="form.category" label="分类" :columns="categoryColumns" />
      <wd-picker v-if="subColumns.length" v-model="subModel" label="二级分类" :columns="subColumns" />
      <view class="manage" @click="goCategories">管理分类</view>
      <wd-input v-model="minutesText" label="用时" type="number" placeholder="分钟" />
      <wd-input v-model="tagsText" label="标签" placeholder="用空格分隔，如：甜口 快手菜" />
    </wd-cell-group>

    <view class="card section">
      <view class="section-hd">
        <text class="section-title">食材</text>
        <text v-if="filledIngredients" class="chip">{{ filledIngredients }} 样</text>
      </view>
      <view v-for="row in ingredientRows" :key="row.id" class="row">
        <input
          v-model="row.name"
          class="field name"
          :class="{ focus: focusKey === `n${row.id}` }"
          placeholder="食材"
          :placeholder-style="PLACEHOLDER"
          :maxlength="20"
          :focus="focusId === `n${row.id}`"
          @focus="focusKey = `n${row.id}`"
          @blur="focusKey = ''"
        />
        <input
          v-model="row.qty"
          class="field qty"
          :class="{ focus: focusKey === `q${row.id}` }"
          placeholder="用量，如 2个"
          :placeholder-style="PLACEHOLDER"
          :maxlength="20"
          @focus="focusKey = `q${row.id}`"
          @blur="focusKey = ''"
        />
        <view class="remove" @click="removeRow(ingredientRows, row.id)">
          <wd-icon name="close" size="16px" />
        </view>
      </view>
      <view class="add" @click="addIngredient">
        <wd-icon name="add" size="16px" />
        <text>添加食材</text>
      </view>
    </view>

    <view class="card section">
      <view class="section-hd">
        <text class="section-title">做法</text>
        <text v-if="filledSteps" class="chip">{{ filledSteps }} 步</text>
      </view>
      <view v-for="(row, index) in stepRows" :key="row.id" class="row step">
        <text class="num">{{ index + 1 }}</text>
        <textarea
          v-model="row.text"
          class="field"
          :class="{ focus: focusKey === `s${row.id}` }"
          placeholder="这一步怎么做"
          :placeholder-style="PLACEHOLDER"
          :maxlength="200"
          auto-height
          :focus="focusId === `s${row.id}`"
          @focus="focusKey = `s${row.id}`"
          @blur="focusKey = ''"
        />
        <view class="remove" @click="removeRow(stepRows, row.id)">
          <wd-icon name="close" size="16px" />
        </view>
      </view>
      <view class="add" @click="addStep">
        <wd-icon name="add" size="16px" />
        <text>添加步骤</text>
      </view>
    </view>

    <wd-button block :loading="saving" @click="save">保存</wd-button>
    <wd-button v-if="form._id" block plain type="error" @click="remove">删除这道菜</wd-button>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import { useSessionStore } from '@/stores/session'
import type { DishInput } from '@/types/models'
import { usePhotoUrl } from '@/utils/photo'

const { family } = storeToRefs(useSessionStore())
const categoryColumns = computed(() =>
  (family.value?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))
)

const NO_SUB = '_none'
/** 当前一级分类下的二级分类选项；该分类没有二级分类时为空，不显示选择器 */
const subColumns = computed(() => {
  const subs = family.value?.categories.find((c) => c.id === form.category)?.subs ?? []
  return subs.length
    ? [{ value: NO_SUB, label: '不细分' }, ...subs.map((s) => ({ value: s.id, label: s.name }))]
    : []
})
const subModel = computed({
  get: () => form.subCategory || NO_SUB,
  set: (v: string) => {
    form.subCategory = v === NO_SUB ? '' : v
  },
})

const form = reactive<DishInput>({
  name: '',
  photo: '',
  category: family.value?.categories[0]?.id ?? 'other',
  subCategory: '',
  tags: [],
  ingredients: [],
  steps: [],
})
const photoUrl = usePhotoUrl(() => form.photo ?? '')
const minutesText = ref('')
const tagsText = ref('')
const saving = ref(false)
const uploading = ref(false)
const quickText = ref('')
const drafting = ref(false)
const generating = ref(false)

interface IngredientRow {
  id: number
  name: string
  qty: string
}
interface StepRow {
  id: number
  text: string
}

/** 输入框占位字色：在浅灰底上也要够清楚（对比度约 5:1） */
const PLACEHOLDER = 'color: #5f6e73'
let rowSeq = 0
const nextId = (): number => ++rowSeq
const ingredientRows = ref<IngredientRow[]>([{ id: nextId(), name: '', qty: '' }])
const stepRows = ref<StepRow[]>([{ id: nextId(), text: '' }])
/** 当前聚焦的输入框，用来画聚焦描边（小程序里原生输入框不支持 :focus） */
const focusKey = ref('')
/** 刚添加的那一行，让它自动聚焦 */
const focusId = ref('')
const filledIngredients = computed(() => ingredientRows.value.filter((r) => r.name.trim()).length)
const filledSteps = computed(() => stepRows.value.filter((r) => r.text.trim()).length)

function setIngredients(list: { name: string; qty: string }[]): void {
  ingredientRows.value = list.length
    ? list.map((i) => ({ id: nextId(), name: i.name, qty: i.qty }))
    : [{ id: nextId(), name: '', qty: '' }]
}

function setSteps(list: string[]): void {
  stepRows.value = list.length ? list.map((text) => ({ id: nextId(), text })) : [{ id: nextId(), text: '' }]
}

function addIngredient(): void {
  const id = nextId()
  ingredientRows.value.push({ id, name: '', qty: '' })
  focusId.value = `n${id}`
}

function addStep(): void {
  const id = nextId()
  stepRows.value.push({ id, text: '' })
  focusId.value = `s${id}`
}

function removeRow(rows: { id: number }[], id: number): void {
  const index = rows.findIndex((r) => r.id === id)
  if (index >= 0) rows.splice(index, 1)
}

// 换了一级分类后，原来的二级分类不再适用就清掉
watch(subColumns, (cols) => {
  if (form.subCategory && !cols.some((c) => c.value === form.subCategory)) form.subCategory = ''
})

onLoad(async (query) => {
  const id = query?.id ? String(query.id) : ''
  if (!id) return
  try {
    const dish = await menuCo().getDish(id)
    Object.assign(form, {
      _id: dish._id,
      name: dish.name,
      photo: dish.photo ?? '',
      category: dish.category,
      subCategory: dish.subCategory ?? '',
    })
    minutesText.value = dish.minutes ? String(dish.minutes) : ''
    tagsText.value = dish.tags.join(' ')
    setIngredients(dish.ingredients)
    setSteps(dish.steps)
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
})

/**
 * 让 AI 生成草稿并填进表单，没有照片时再顺带配一张图；都不直接保存，用户检查后点「保存」。
 * 文字先填好，图片慢一些，单独生成，失败也不影响已填好的菜谱。
 */
async function draft(): Promise<void> {
  if (!quickText.value.trim()) {
    uni.showToast({ title: '先写个菜名', icon: 'none' })
    return
  }
  drafting.value = true
  try {
    const d = await menuCo().draftDish(quickText.value.trim())
    form.name = d.name
    form.category = d.category
    form.subCategory = d.subCategory ?? ''
    minutesText.value = d.minutes ? String(d.minutes) : ''
    tagsText.value = d.tags.join(' ')
    setIngredients(d.ingredients)
    setSteps(d.steps)
    if (form.photo) {
      uni.showToast({ title: '已填好，检查后保存', icon: 'none' })
    } else if (await generateImage()) {
      uni.showToast({ title: '菜谱和图片都好了，检查后保存', icon: 'none' })
    }
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    drafting.value = false
  }
}

function goCategories(): void {
  uni.navigateTo({ url: '/pages/categories/index' })
}

async function choosePhoto(): Promise<void> {
  if (generating.value) return
  try {
    // crop 让支持的端先裁成正方形；不支持的端忽略它，显示时也会居中裁成方形
    const { tempFilePaths } = await uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      crop: { width: 1024, height: 1024, quality: 85 },
    })
    const filePath = Array.isArray(tempFilePaths) ? tempFilePaths[0] : tempFilePaths
    uploading.value = true
    const res = await uniCloud.uploadFile({ filePath, cloudPath: `dish/${Date.now()}.jpg` })
    form.photo = res.fileID
  } catch (err) {
    if (!String(errorMessage(err)).includes('cancel')) {
      uni.showToast({ title: errorMessage(err), icon: 'none' })
    }
  } finally {
    uploading.value = false
  }
}

/** 按菜名和食材生成配图并写进 form.photo；失败时弹出原因，返回是否成功 */
async function generateImage(): Promise<boolean> {
  generating.value = true
  try {
    form.photo = await menuCo().generateDishImage({
      name: form.name.trim(),
      ingredients: ingredientRows.value.map((r) => r.name.trim()).filter(Boolean),
    })
    return true
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
    return false
  } finally {
    generating.value = false
  }
}

/** 单独让 AI 画一张配图，生成后直接预览，点「保存」才算数 */
async function generatePhoto(): Promise<void> {
  if (generating.value) return
  if (!form.name.trim()) {
    uni.showToast({ title: '先写菜名', icon: 'none' })
    return
  }
  if (form.photo) {
    const { confirm } = await uni.showModal({ title: '替换现有照片？', content: 'AI 生成的图会替换当前这张' })
    if (!confirm) return
  }
  if (await generateImage()) uni.showToast({ title: '已生成，满意就保存', icon: 'none' })
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    uni.showToast({ title: '请填写菜名', icon: 'none' })
    return
  }
  if (generating.value) {
    uni.showToast({ title: '图片还在生成，稍等一下', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await menuCo().saveDish({
      ...form,
      name: form.name.trim(),
      minutes: Number(minutesText.value) || undefined,
      tags: tagsText.value.split(/\s+/).filter(Boolean),
      ingredients: ingredientRows.value
        .map((r) => ({ name: r.name.trim(), qty: r.qty.trim() }))
        .filter((i) => i.name),
      steps: stepRows.value.map((r) => r.text.trim()).filter(Boolean),
    })
    uni.navigateBack()
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  const { confirm } = await uni.showModal({
    title: '删除这道菜？',
    content: '历史菜单里的记录会显示为「已删除的菜」',
  })
  if (!confirm || !form._id) return
  try {
    await menuCo().removeDish(form._id)
    uni.switchTab({ url: '/pages/dishes/index' })
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
}
</script>

<style lang="scss" scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.section-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.section-title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 700;
}

.chip {
  padding: 1px 10px;
  color: var(--c-accent);
  font-size: 12px;
  background: var(--c-accent-soft);
  border-radius: var(--radius-pill);
}

.field {
  box-sizing: border-box;
  width: 100%;
  padding: 9px 12px;
  font-size: 15px;
  line-height: 1.6;
  background: var(--c-bg);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
}

.field.focus {
  background: var(--c-surface);
  border-color: var(--c-accent);
  box-shadow: 0 2px 8px rgba(48, 77, 96, 0.14);
}

.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.row .name,
.row .qty {
  min-width: 0;
  height: 40px;
  padding: 0 12px;
}

.row .name {
  flex: 1.3;
  width: auto;
}

.row .qty {
  flex: 1;
  width: auto;
}

.step {
  align-items: flex-start;
}

.step .field {
  flex: 1;
  width: auto;
  min-width: 0;
}

.num {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 8px;
  color: #fff;
  font-size: 12px;
  background: var(--c-accent);
  border-radius: 50%;
}

.remove {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--c-text-2);
}

.step .remove {
  margin-top: 2px;
}

.add {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  justify-content: center;
  height: 40px;
  color: var(--c-accent);
  font-size: 14px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--radius-md);
}

.photo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: var(--c-muted-bg);
  border-radius: var(--radius-md);
}

.photo-img {
  width: 100%;
  height: 100%;
}

.manage {
  padding: var(--space-2) var(--space-4);
  color: var(--c-accent);
  font-size: 13px;
  text-align: right;
  background: var(--c-surface);
}
</style>
