<template>
  <view class="page">
    <view class="photo" @click="choosePhoto">
      <image v-if="photoUrl" class="photo-img" :src="photoUrl" mode="aspectFill" />
      <text v-if="!photoUrl" class="muted">{{ uploading ? '上传中…' : '点击添加照片' }}</text>
    </view>

    <wd-cell-group border>
      <wd-input v-model="form.name" label="菜名" placeholder="比如：可乐鸡翅" clearable />
      <wd-picker v-model="form.category" label="分类" :columns="categoryColumns" />
      <view class="manage" @click="goCategories">管理分类</view>
      <wd-input v-model="minutesText" label="用时" type="number" placeholder="分钟" />
      <wd-input v-model="tagsText" label="标签" placeholder="用空格分隔，如：甜口 快手菜" />
    </wd-cell-group>

    <view>
      <view class="label">食材 <text class="muted">一行一样：名称 数量</text></view>
      <wd-textarea v-model="ingredientsText" placeholder="鸡翅中 10个&#10;可乐 1罐" auto-height />
    </view>

    <view>
      <view class="label">做法 <text class="muted">一行一步</text></view>
      <wd-textarea v-model="stepsText" placeholder="鸡翅焯水&#10;煎至两面金黄" auto-height />
    </view>

    <wd-button block :loading="saving" @click="save">保存</wd-button>
    <wd-button v-if="form._id" block plain type="error" @click="remove">删除这道菜</wd-button>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { getCloud } from '@/api/cloud'
import { errorMessage, menuCo } from '@/api/menu'
import { useSessionStore } from '@/stores/session'
import type { DishInput } from '@/types/models'
import { usePhotoUrl } from '@/utils/photo'

const { family } = storeToRefs(useSessionStore())
const categoryColumns = computed(() =>
  (family.value?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))
)

const form = reactive<DishInput>({
  name: '',
  photo: '',
  category: family.value?.categories[0]?.id ?? 'other',
  tags: [],
  ingredients: [],
  steps: [],
})
const photoUrl = usePhotoUrl(() => form.photo ?? '')
const minutesText = ref('')
const tagsText = ref('')
const ingredientsText = ref('')
const stepsText = ref('')
const saving = ref(false)
const uploading = ref(false)

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
    })
    minutesText.value = dish.minutes ? String(dish.minutes) : ''
    tagsText.value = dish.tags.join(' ')
    ingredientsText.value = dish.ingredients.map((i) => `${i.name} ${i.qty}`.trim()).join('\n')
    stepsText.value = dish.steps.join('\n')
  } catch (err) {
    uni.showToast({ title: errorMessage(err), icon: 'none' })
  }
})

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function goCategories(): void {
  uni.navigateTo({ url: '/pages/categories/index' })
}

async function choosePhoto(): Promise<void> {
  try {
    const { tempFilePaths } = await uni.chooseImage({ count: 1, sizeType: ['compressed'] })
    const filePath = Array.isArray(tempFilePaths) ? tempFilePaths[0] : tempFilePaths
    uploading.value = true
    const res = await getCloud().uploadFile({ filePath, cloudPath: `dish/${Date.now()}.jpg` })
    form.photo = res.fileID
  } catch (err) {
    if (!String(errorMessage(err)).includes('cancel')) {
      uni.showToast({ title: errorMessage(err), icon: 'none' })
    }
  } finally {
    uploading.value = false
  }
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    uni.showToast({ title: '请填写菜名', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await menuCo().saveDish({
      ...form,
      name: form.name.trim(),
      minutes: Number(minutesText.value) || undefined,
      tags: tagsText.value.split(/\s+/).filter(Boolean),
      ingredients: lines(ingredientsText.value).map((l) => {
        const [name, ...rest] = l.split(/\s+/)
        return { name, qty: rest.join(' ') }
      }),
      steps: lines(stepsText.value),
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
.photo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 180px;
  overflow: hidden;
  background: var(--c-muted-bg);
  border-radius: var(--radius-md);
}

.photo-img {
  width: 100%;
  height: 100%;
}

.label {
  margin-bottom: var(--space-2);
  font-weight: 500;
}

.manage {
  padding: var(--space-2) var(--space-4);
  color: var(--c-accent);
  font-size: 13px;
  text-align: right;
  background: var(--c-surface);
}
</style>
