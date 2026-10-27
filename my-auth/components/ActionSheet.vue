<template>
  <view v-if="open" class="sheet-overlay" @click="$emit('close')" @touchmove.stop.prevent>
    <view class="sheet-panel" @click.stop>
      <view class="sheet-handle" />
      <text class="sheet-title">{{ title }}</text>
      <text v-if="subtitle" class="sheet-subtitle">{{ subtitle }}</text>
      <button v-for="item in actions" :key="item.value" class="sheet-action" :class="{ 'is-danger': item.danger }" hover-class="ui-tap" @click="$emit('select', item.value)">
        <AppIcon :name="item.icon" :size="19" />
        <text>{{ item.label }}</text>
      </button>
      <button class="ui-secondary sheet-cancel" hover-class="ui-tap" @click="$emit('close')">取消</button>
    </view>
  </view>
</template>

<script setup>
import AppIcon from './AppIcon.vue';
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  actions: { type: Array, default: () => [] },
});
defineEmits(['close', 'select']);
</script>

<style scoped>
.sheet-overlay { position: fixed; z-index: 100; inset: 0; display: flex; align-items: flex-end; background: rgba(37,40,36,.28); }
.sheet-panel { width: 100%; padding: 10px 20px 22px; padding-bottom: calc(22px + env(safe-area-inset-bottom)); background: #fbfbf6; border-radius: 26px 26px 0 0; }
.sheet-handle { width: 33px; height: 4px; margin: 0 auto 22px; border-radius: 4px; background: #daddd1; }
.sheet-title { display: block; font-size: 19px; font-weight: 700; }
.sheet-subtitle { display: block; font-size: 12px; line-height: 1.8; color: var(--auth-muted); margin: 8px 0 18px; overflow-wrap: anywhere; }
.sheet-action { display: flex; align-items: center; width: 100%; min-height: 54px; padding: 12px 0; margin: 0; border-top: 1px solid var(--auth-line); background: transparent; font-size: 14px; line-height: 1.6; text-align: left; }
.sheet-action text { margin-left: 13px; }
.sheet-action.is-danger { color: var(--auth-danger); }
.sheet-cancel { margin-top: 12px; min-height: 44px; }
</style>
