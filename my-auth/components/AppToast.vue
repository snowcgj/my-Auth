<template>
  <view v-if="message" class="notice-position" role="status" aria-live="polite">
    <view class="notice-pill"><AppIcon :name="kind === 'success' ? 'check' : 'info'" :size="16" light /><text>{{ message }}</text></view>
  </view>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';
import AppIcon from './AppIcon.vue';
const message = ref('');
const kind = ref('success');
let timer = null;
function clear() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  message.value = '';
}
function show(text, tone = 'success') {
  clear();
  message.value = text;
  kind.value = tone;
  timer = setTimeout(clear, 2200);
}
onBeforeUnmount(clear);
defineExpose({ show, clear });
</script>

<style scoped>
.notice-position { position: fixed; z-index: 140; left: 20px; right: 20px; top: 90px; top: calc(var(--status-bar-height, 0px) + 90px); display: flex; justify-content: center; pointer-events: none; }
.notice-pill { display: flex; align-items: center; max-width: 100%; padding: 12px 16px; border-radius: 16px; background: #30352e; color: #fff; box-shadow: 0 6px 22px rgba(37,40,36,.13); }
.notice-pill text { margin-left: 8px; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
</style>
