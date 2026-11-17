<template>
  <view class="feeding-page">
    <FeedingHeader title="食物档案" subtitle="每次尝试，都有记录。" />
    <view class="feeding-content feeding-sheet">
      <NoFamily v-if="noFamily" />
      <StateView v-else :loading="loading" :error="error" @retry="reload">
        <FoodArchive :foods="foods" @saved="reload" />
      </StateView>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { menuCo } from '@/api/menu'
import NoFamily from '@/components/NoFamily.vue'
import StateView from '@/components/StateView.vue'
import { usePageData } from '@/composables/use-page-data'
import FeedingHeader from './FeedingHeader.vue'
import FoodArchive from './FoodArchive.vue'
import type { FeedingFood } from './model'

const foods = ref<FeedingFood[]>([])
const { loading, error, noFamily, reload } = usePageData(async () => {
  foods.value = await menuCo().listFeeding()
})
</script>

<style scoped lang="scss">
@use './feeding.scss';
</style>
