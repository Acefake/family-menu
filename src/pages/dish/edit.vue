<template>
  <view class="page">
    <view class="card photo-card">
      <view class="photo" @click="choosePhoto">
        <image v-if="photoUrl" class="photo-img" :src="photoUrl" mode="aspectFill" />
        <text v-if="!photoUrl" class="muted">{{
          uploading ? '上传中…' : generating ? '图片生成中…' : '点击添加'
        }}</text>
      </view>
      <view class="photo-side">
        <text class="section-title">菜品图片</text>
        <text class="muted">方图。可以拍照，也可以让 AI 画</text>
        <view class="photo-btn" @click="choosePhoto">拍照 / 相册</view>
        <view class="photo-btn" @click="generatePhoto">AI {{ form.photo ? '重画' : '生成' }}图片</view>
      </view>
    </view>

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
        <text v-if="hotIng.size" class="hot-note">AI 改了 {{ hotIng.size }} 处</text>
        <text v-else-if="filledIngredients" class="chip">{{ filledIngredients }} 样</text>
      </view>
      <view v-for="row in ingredientRows" :key="row.id" class="row">
        <input
          v-model="row.name"
          class="field name"
          :class="{ focus: focusKey === `n${row.id}`, hot: hotIng.has(row.id) }"
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
          :class="{ focus: focusKey === `q${row.id}`, hot: hotIng.has(row.id) }"
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
        <text v-if="stepsPending" class="hot-note">AI 正在写做法…</text>
        <text v-else-if="hotSteps.size" class="hot-note">AI 改了 {{ hotSteps.size }} 处</text>
        <text v-else-if="filledSteps" class="chip">{{ filledSteps }} 步</text>
      </view>
      <view v-for="(row, index) in stepRows" :key="row.id" class="row step">
        <text class="num">{{ index + 1 }}</text>
        <textarea
          v-model="row.text"
          class="field"
          :class="{ focus: focusKey === `s${row.id}`, hot: hotSteps.has(row.id) }"
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

    <wd-button v-if="form._id" block plain type="error" @click="remove">删除这道菜</wd-button>

    <AiProgress :visible="popup" stage="image" />
    <AiChatSheet
      :visible="chatOpen"
      :messages="messages"
      :busy="busy"
      :placeholder="placeholder"
      :suggestions="suggestions"
      :can-undo="undoStack.length > 0"
      @close="chatOpen = false"
      @send="onSend"
      @undo="undo"
    />

    <view class="bar">
      <view class="ask" @click="chatOpen = true">
        <image class="spark" src="/static/illus/spark.svg" mode="aspectFit" />
        <text class="ask-text">{{ placeholder }}</text>
      </view>
      <view :class="['btn', 'save', { disabled: saving }]" @click="save">保存</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'

import { errorMessage, menuCo } from '@/api/menu'
import AiChatSheet from '@/components/AiChatSheet.vue'
import AiProgress from '@/components/AiProgress.vue'
import { useSessionStore } from '@/stores/session'
import type { ChatMessage, DishDraft, DishInput } from '@/types/models'
import { diffDish } from '@/utils/dish-diff'
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
/** 正在生成配图（不管有没有弹窗）：期间不让换图、不让保存 */
const generating = ref(false)
/** 配图时要不要盖上进度弹窗：点「AI 生成图片」时盖，在对话里新建菜时不盖，免得挡住对话和逐段出现的内容 */
const popup = ref(false)
/** 新建菜时做法还在写，表单里的做法区显示提示 */
const stepsPending = ref(false)

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

// —— 和 AI 对话修改 ——

const chatOpen = ref(false)
const messages = ref<ChatMessage[]>([])
/** AI 正在回复；这段时间不让保存，免得存到改了一半的内容 */
const busy = ref(false)
/** 每次 AI 改之前的菜谱，撤销时一层层退回去 */
const undoStack = ref<DishDraft[]>([])
/** AI 刚改过的食材行 / 做法行，在表单里高亮，保存后就不用再标了 */
const hotIng = ref(new Set<number>())
const hotSteps = ref(new Set<number>())
let msgSeq = 0

/** 表单还是空的：这时说的话当作菜名，让 AI 写一道新菜；否则当作修改要求 */
const isBlank = computed(() => !form.name.trim() && !filledIngredients.value && !filledSteps.value)
const placeholder = computed(() => (isBlank.value ? '说个菜名，AI 帮你写好菜谱和配图' : '跟 AI 说说怎么改…'))
const suggestions = computed(() =>
  isBlank.value
    ? ['番茄炒蛋', '红烧肉', '可乐鸡翅']
    : ['更清淡一点', '做法再简单点', '少放点油', '加个配菜', '换成鸡翅']
)

function say(role: ChatMessage['role'], text: string, diff?: string[]): void {
  messages.value.push({ id: ++msgSeq, role, text, diff })
}

/** 把表单现在的内容取成一份菜谱，给 AI 看，也留着给撤销用 */
function snapshot(): DishDraft {
  return {
    name: form.name.trim(),
    category: form.category,
    subCategory: form.subCategory ?? '',
    minutes: Number(minutesText.value) || undefined,
    tags: tagsText.value.split(/\s+/).filter(Boolean),
    ingredients: ingredientRows.value
      .map((r) => ({ name: r.name.trim(), qty: r.qty.trim() }))
      .filter((i) => i.name),
    steps: stepRows.value.map((r) => r.text.trim()).filter(Boolean),
  }
}

/** 把一份菜谱填回表单（不含照片） */
function applyDraft(d: DishDraft): void {
  form.name = d.name
  form.category = d.category
  form.subCategory = d.subCategory ?? ''
  minutesText.value = d.minutes ? String(d.minutes) : ''
  tagsText.value = d.tags.join(' ')
  setIngredients(d.ingredients)
  setSteps(d.steps)
}

function clearHot(): void {
  hotIng.value = new Set()
  hotSteps.value = new Set()
}

/** 对比 AI 改之前的菜谱，把改过的食材行和做法行标出来 */
function markChanged(before: DishDraft): void {
  const hadIng = new Set(before.ingredients.map((i) => `${i.name}|${i.qty}`))
  hotIng.value = new Set(
    ingredientRows.value.filter((r) => r.name.trim() && !hadIng.has(`${r.name}|${r.qty}`)).map((r) => r.id)
  )
  const hadSteps = new Set(before.steps)
  hotSteps.value = new Set(
    stepRows.value.filter((r) => r.text.trim() && !hadSteps.has(r.text)).map((r) => r.id)
  )
}

/** 做法这一步：写好就填进表单；失败不影响已经填好的食材，说一句「把做法补上」可以再来 */
async function writeSteps(basics: DishDraft, text: string): Promise<void> {
  stepsPending.value = true
  try {
    const { steps } = await menuCo().draftDishSteps({
      name: basics.name,
      ingredients: basics.ingredients,
      instruction: text,
    })
    setSteps(steps)
    say('ai', `做法写好了（${steps.length} 步）。`)
  } catch (err) {
    say('ai', `做法没写出来：${errorMessage(err)}。可以说一句「把做法补上」再试。`)
  } finally {
    stepsPending.value = false
  }
}

/**
 * 表单是空的：让 AI 按菜名写一道新菜，分段出结果。
 * 先要基本信息和食材（快），表单马上填上；做法和配图同时去写，哪个先好哪个先出现。
 */
async function createByAi(text: string): Promise<void> {
  const basics = await menuCo().draftDishBasics(text)
  undoStack.value.push(snapshot())
  applyDraft(basics)
  clearHot()
  const needImage = !form.photo
  say(
    'ai',
    `「${basics.name}」的食材先写好了（${basics.ingredients.length} 样），正在写做法${needImage ? '和配图' : ''}…`
  )
  const [, imageOk] = await Promise.all([writeSteps(basics, text), needImage ? generateImage(false) : true])
  say(
    'ai',
    imageOk
      ? '都好了。还想怎么改？比如：少放点油、换成鸡翅。'
      : '图没配成功，可以点「AI 生成图片」再试。菜谱还想怎么改？'
  )
}

/** 表单有内容：把当前菜谱和这句话（连同之前的对话）交给 AI，改完列出前后差别 */
async function reviseByAi(text: string): Promise<void> {
  const before = snapshot()
  const history = messages.value.slice(0, -1).map(({ role, text: t }) => ({ role, text: t }))
  const { reply, dish } = await menuCo().reviseDish({ dish: before, instruction: text, history })
  const diff = diffDish(before, dish, family.value?.categories ?? [])
  if (!diff.length) {
    say('ai', `${reply}（菜谱没有变化）`)
    return
  }
  undoStack.value.push(before)
  applyDraft(dish)
  markChanged(before)
  say('ai', reply, diff)
}

async function onSend(text: string): Promise<void> {
  if (busy.value) return
  say('me', text)
  busy.value = true
  try {
    await (isBlank.value ? createByAi(text) : reviseByAi(text))
  } catch (err) {
    say('ai', errorMessage(err))
  } finally {
    busy.value = false
  }
}

/** 退回 AI 上一次修改之前的样子 */
function undo(): void {
  const previous = undoStack.value.pop()
  if (!previous) return
  applyDraft(previous)
  clearHot()
  say('ai', '已撤销上一次修改。')
}

onLoad(async (query) => {
  const id = query?.id ? String(query.id) : ''
  if (!id) {
    // 新建：直接把对话打开，说个菜名就开始
    say('ai', '说个菜名，我来写菜谱、配图；写好后还能接着说怎么改。')
    chatOpen.value = true
    return
  }
  say('ai', '想怎么改这道菜？比如：少放点油、换成鸡翅、做法再简单点。')
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

function goCategories(): void {
  uni.navigateTo({ url: '/pages/categories/index' })
}

async function choosePhoto(): Promise<void> {
  if (generating.value || busy.value) return
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
async function generateImage(showPopup = true): Promise<boolean> {
  generating.value = true
  popup.value = showPopup
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
    popup.value = false
  }
}

/** 单独让 AI 画一张配图，生成后直接预览，点「保存」才算数 */
async function generatePhoto(): Promise<void> {
  if (generating.value || busy.value) return
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
  if (generating.value || busy.value) {
    uni.showToast({ title: 'AI 还在忙，稍等一下', icon: 'none' })
    return
  }
  saving.value = true
  try {
    const dish = snapshot()
    await menuCo().saveDish({ ...form, ...dish })
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
/* 底部固定操作条占位 */
.page {
  padding-bottom: 110px;
}

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

.hot-note {
  padding: 1px 10px;
  color: var(--c-warn);
  font-size: 12px;
  background: var(--c-warn-soft);
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

/* AI 刚改过的行 */
.field.hot {
  background: var(--c-warn-soft);
  border-color: #e6d6ad;
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

/* 缩略方图 + 右边的操作 */
.photo-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: var(--space-4);
}

.photo {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 132px;
  height: 132px;
  overflow: hidden;
  background: var(--c-muted-bg);
  border-radius: var(--radius-md);
}

.photo-img {
  width: 100%;
  height: 100%;
}

.photo-side {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.photo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  color: var(--c-accent);
  font-size: 14px;
  border: 1px solid var(--c-accent);
  border-radius: var(--radius-pill);

  &:active {
    opacity: 0.7;
  }
}

.manage {
  padding: var(--space-2) var(--space-4);
  color: var(--c-accent);
  font-size: 13px;
  text-align: right;
  background: var(--c-surface);
}

/* 底部固定：对话入口 + 保存 */
.ask {
  display: flex;
  flex: 1;
  gap: var(--space-2);
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  color: var(--c-text-2);
  font-size: 14px;
  background: var(--c-bg);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-pill);
}

.spark {
  flex: none;
  width: 16px;
  height: 16px;
}

.ask-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save {
  flex: 0 0 96px;
  border-radius: var(--radius-pill);
}
</style>
