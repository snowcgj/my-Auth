<template>
  <view v-if="open" class="busy-layer" @touchmove.stop.prevent>
    <view class="busy-card" role="status" aria-live="polite" aria-busy="true">
      <view class="busy-symbol"><view class="busy-ring" /><AppIcon name="lock" :size="22" /></view>
      <text class="busy-title">{{ title }}</text><text class="busy-description">{{ description }}</text>
      <view class="busy-footer"><view class="busy-dot" /><text>请稍候，完成后会自动继续</text></view>
    </view>
  </view>
</template>

<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ open: { type: Boolean, default: false }, title: { type: String, default: '正在处理' }, description: { type: String, default: '' } });
</script>

<style scoped>
.busy-layer { position: fixed; inset: 0; z-index: 120; padding: 30px; display: flex; align-items: center; justify-content: center; background: rgba(37,40,36,.3); }
.busy-card { width: 100%; max-width: 310px; padding: 28px 24px 22px; background: #fbfbf6; border-radius: 25px; text-align: center; box-shadow: 0 16px 55px rgba(37,40,36,.12); }
.busy-symbol { position: relative; display: flex; align-items: center; justify-content: center; width: 66px; height: 66px; margin: 0 auto 22px; background: var(--auth-purple); border-radius: 23px; }
.busy-ring { position: absolute; inset: -6px; border: 2px solid #e1dbe9; border-top-color: #8a75a3; border-radius: 28px; animation: busy-turn 1.5s linear infinite; }
.busy-title { display: block; font-size: 20px; font-weight: 700; line-height: 1.5; }
.busy-description { display: block; margin-top: 12px; color: var(--auth-muted); font-size: 13px; line-height: 1.9; }
.busy-footer { display: flex; align-items: center; justify-content: center; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--auth-line); color: #919985; font-size: 11px; line-height: 1.7; }
.busy-dot { width: 5px; height: 5px; margin-right: 6px; background: #9aa787; border-radius: 50%; }
@keyframes busy-turn { to { transform: rotate(360deg); } }
</style>
