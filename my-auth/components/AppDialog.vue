<template>
  <view v-if="open" class="dialog-layer">
    <view class="dialog-backdrop" @click="$emit('cancel')" @touchmove.stop.prevent />
    <view class="dialog-panel" role="dialog" aria-modal="true" :aria-label="title" @click.stop @touchmove.stop>
      <view class="dialog-symbol" :class="{ 'is-danger': danger }"><AppIcon :name="icon" :size="24" /></view>
      <text class="dialog-title">{{ title }}</text>
      <scroll-view scroll-y class="dialog-content">
        <slot><text class="dialog-description">{{ description }}</text></slot>
      </scroll-view>
      <view class="dialog-actions">
        <button v-if="showCancel" class="ui-secondary dialog-button" hover-class="ui-tap" @click="$emit('cancel')">{{ cancelText }}</button>
        <button class="ui-primary dialog-button" :class="{ 'danger-button': danger }" hover-class="ui-tap" @click="$emit('confirm')">{{ confirmText }}</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import AppIcon from './AppIcon.vue';
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'info' },
  danger: { type: Boolean, default: false },
  showCancel: { type: Boolean, default: false },
  confirmText: { type: String, default: '知道了' },
  cancelText: { type: String, default: '取消' },
});
defineEmits(['confirm', 'cancel']);
</script>

<style scoped>
.dialog-layer { position: fixed; inset: 0; z-index: 110; display: flex; align-items: center; justify-content: center; padding: 24px; }
.dialog-backdrop { position: absolute; inset: 0; background: var(--auth-mask); }
.dialog-panel { position: relative; width: 100%; max-width: 360px; max-height: 85vh; padding: 24px; border: 1px solid var(--auth-line); border-radius: 26px; background: var(--auth-raised); box-shadow: 0 16px 55px rgba(37,40,36,.12); }
.dialog-symbol { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; margin-bottom: 17px; background: var(--auth-purple); border-radius: 16px; }
.dialog-symbol.is-danger { background: var(--auth-danger-soft); }
.dialog-title { display: block; font-size: 21px; font-weight: 700; line-height: 1.5; }
.dialog-content { max-height: 43vh; margin-top: 13px; }
.dialog-description { display: block; color: var(--auth-muted); font-size: 13px; line-height: 1.9; white-space: pre-line; overflow-wrap: anywhere; }
.dialog-actions { display: flex; margin-top: 24px; }
.dialog-button { flex: 1; min-width: 0; min-height: 46px; }
.dialog-button + .dialog-button { margin-left: 10px; }
.danger-button { background: #a75a4b; color: #fff; }
@media (max-height: 550px) { .dialog-panel { padding: 18px; }.dialog-symbol { display: none; }.dialog-content { max-height: 35vh; }.dialog-actions { margin-top: 16px; } }
</style>
