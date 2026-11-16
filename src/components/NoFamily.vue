<template>
  <view class="state">
    <view>还没有加入家庭</view>
    <wd-button size="small" custom-style="margin-top: 12px" @click="goMine">去创建或加入</wd-button>
  </view>
</template>

<script setup lang="ts">
function goMine(): void {
  uni.switchTab({ url: '/pages/mine/index' })
}
</script>
