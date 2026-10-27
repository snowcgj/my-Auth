<template>
  <view class="service-icon" :style="{ backgroundColor: customSource ? '#ffffff' : appearance.background }">
    <image v-if="customSource || appearance.image" class="service-image" :src="customSource || appearance.image" mode="aspectFit" @error="imageFailed = true" />
    <text v-else class="service-letter" :style="{ color: appearance.color }">{{ initial }}</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ service: { type: String, default: '' }, icon: { type: String, default: '' } });
const imageFailed = ref(false);
watch(() => [props.service, props.icon], () => { imageFailed.value = false; });
const name = computed(() => props.service.trim() || 'Auth');
const initial = computed(() => Array.from(name.value)[0].toUpperCase());
const customSource = computed(() => !imageFailed.value && props.icon && props.icon !== '/static/logo.png' ? props.icon : '');
const appearance = computed(() => {
  const normalized = name.value.toLowerCase();
  const known = {
    github: { image: '/static/ui/service-github.png', background: '#ffffff' },
    wise: { image: '/static/ui/service-wise.png', background: '#c8ed9b' },
    microsoft: { image: '/static/ui/service-microsoft.png', background: '#f3f4ed' },
    'microsoft account': { image: '/static/ui/service-microsoft.png', background: '#f3f4ed' },
  };
  if (known[normalized] && !imageFailed.value) return known[normalized];
  const palette = [
    { background: '#eee9de', color: '#826a48' },
    { background: '#e5eddf', color: '#536d48' },
    { background: '#e8e4f5', color: '#77648e' },
    { background: '#e1edf1', color: '#52717b' },
    { background: '#f1e4df', color: '#95634e' },
  ];
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
});
</script>

<style scoped>
.service-icon { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: 12px; overflow: hidden; }
.service-image { display: block; width: 23px; height: 23px; }
.service-letter { font-size: 19px; line-height: 1; font-weight: 700; }
</style>
