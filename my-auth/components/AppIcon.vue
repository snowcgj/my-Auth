<template>
  <image class="app-icon" :src="source" :style="dimensions" mode="aspectFit" />
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 20 },
  light: { type: Boolean, default: false },
});
const source = computed(() => `/static/ui/${props.name}${props.light ? '-light' : ''}.png`);
const dimensions = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));
</script>

<style scoped>
.app-icon { display: block; flex-shrink: 0; }
</style>
