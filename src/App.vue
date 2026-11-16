<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  // 登录放到各页面 onShow 的 ensureReady 里，便于失败后重试
})
</script>

<style lang="scss">
@import './styles/base.scss';
</style>
