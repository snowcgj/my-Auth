<template>
  <view class="app-header">
    <view class="header-main">
      <button v-if="back" class="ui-icon-button back-button" :disabled="disabled" aria-label="返回" hover-class="ui-tap" @click="$emit('back')">
        <AppIcon name="back" :size="20" />
      </button>
      <view class="header-copy">
        <view class="title-row">
          <image v-if="brand" class="brand-icon" src="/static/branding/zhima/mark-96.png" mode="aspectFit" />
          <text class="header-title" :class="{ 'brand-title': brand }">{{ title }}</text>
        </view>
        <text v-if="subtitle" class="header-subtitle">{{ subtitle }}</text>
      </view>
      <slot />
    </view>
  </view>
</template>

<script setup>
import AppIcon from './AppIcon.vue';
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  brand: { type: Boolean, default: false },
  back: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
defineEmits(['back']);
</script>

<style scoped>
.app-header { padding: 20px 20px 18px; padding-top: calc(var(--status-bar-height, 0px) + 20px); }
.header-main { display: flex; align-items: center; min-height: 52px; }
.header-copy { flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; }
.brand-icon { width: 28px; height: 30px; margin-right: 9px; }
.header-title { display: block; font-size: 25px; line-height: 1.25; font-weight: 700; letter-spacing: -.5px; }
.brand-title { font-size: 28px; font-weight: 800; letter-spacing: 2px; }
.header-subtitle { display: block; margin-top: 8px; font-size: 12px; color: var(--auth-muted); line-height: 1.5; }
.back-button { margin-right: 12px; }
/* 小程序自定义导航给系统胶囊留位，待恢复该端验收时复核。 */
/* #ifdef MP-WEIXIN */
.app-header { padding-right: 100px; }
/* #endif */
</style>
