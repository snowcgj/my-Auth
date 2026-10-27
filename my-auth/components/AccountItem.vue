<template>
  <view class="account-card" :class="{ 'is-pinned': pinned }">
    <view class="account-heading">
      <ServiceIcon :service="app" :icon="icon" />
      <view class="account-identity"><text class="service-name">{{ app }}</text><text class="account-name">{{ name }}</text></view>
      <button class="more-button" aria-label="账户操作" hover-class="ui-tap" @click="$emit('more-options', id)"><AppIcon name="more" :size="20" /></button>
    </view>
    <view class="account-body">
      <button class="code-button" :aria-label="unavailable ? '该账户配置不支持' : '复制验证码'" hover-class="ui-tap" @click="onCopyCode">
        <text v-if="unavailable" class="unavailable-code">配置不支持</text>
        <text v-else class="account-code" :class="{ 'eight-digits': digits === 8 }">{{ formattedCode || '— — —' }}</text>
        <AppIcon v-if="code && !unavailable" name="copy" :size="14" />
      </button>
      <view v-if="!unavailable" class="countdown" :class="{ 'is-urgent': countdown <= 5 }">
        <view class="timer-ring" :style="ringStyle"><view class="timer-center" /></view><text>{{ countdown }} 秒</text>
      </view>
    </view>
    <view v-if="pinned" class="pin-note"><AppIcon name="pin" :size="11" /><text>已置顶</text></view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import ServiceIcon from './ServiceIcon.vue';
import { generateTOTP } from '../utils/totp-core.js';

const props = defineProps({
  id: { type: Number, required: true },
  icon: { type: String, default: '' },
  app: { type: String, default: '' },
  name: { type: String, default: '' },
  secret: { type: String, default: '' },
  digits: { type: Number, default: 6 },
  period: { type: Number, default: 30 },
  algorithm: { type: String, default: 'SHA1' },
  timestampSeconds: { type: Number, required: true },
  pinned: { type: Boolean, default: false },
});
const emit = defineEmits(['more-options', 'edit-account', 'toggle-pin', 'delete-account', 'notify']);
const code = ref('');
const unavailable = ref(false);
const countdown = computed(() => props.period - (props.timestampSeconds % props.period));
const formattedCode = computed(() => {
  if (!code.value) return '';
  const split = props.digits === 8 ? 4 : 3;
  return code.value.slice(0, split) + ' ' + code.value.slice(split);
});
const ringStyle = computed(() => {
  const fraction = Math.min(1, Math.max(0, countdown.value / props.period));
  const color = countdown.value <= 5 ? '#c18a50' : props.pinned ? '#8a75a3' : '#81936e';
  const track = props.pinned ? '#d8cfe9' : '#e5e8dd';
  return { background: 'conic-gradient(' + color + ' ' + fraction * 360 + 'deg, ' + track + ' 0deg)' };
});

// 秒级倒计时使用父时钟；只有窗口或配置变化才重算，卡片没有业务定时器。
watch([
  () => Math.floor(props.timestampSeconds / props.period),
  () => props.secret, () => props.digits, () => props.period, () => props.algorithm,
], () => {
  try {
    code.value = generateTOTP({ secret: props.secret, timestampSeconds: props.timestampSeconds, digits: props.digits, period: props.period, algorithm: props.algorithm });
    unavailable.value = false;
  } catch (_) {
    code.value = '';
    unavailable.value = true;
  }
}, { immediate: true });

function onCopyCode() {
  if (unavailable.value || !code.value) {
    emit('notify', unavailable.value ? '该账户配置不支持，无法生成验证码' : '验证码尚未生成', 'error');
    return;
  }
  uni.setClipboardData({
    data: code.value,
    showToast: false,
    success: () => emit('notify', '已复制'),
    fail: () => emit('notify', '复制失败，请重试', 'error'),
  });
}
</script>

<style scoped>
.account-card { padding: 16px 15px 14px; margin-bottom: 11px; background: #fff; border: 1px solid var(--auth-line); border-radius: 20px; }
.account-card.is-pinned { background: var(--auth-purple); border-color: #ded7f0; }
.account-heading { display: flex; align-items: center; }
.account-identity { flex: 1; min-width: 0; margin-left: 10px; }
.service-name { display: block; font-size: 15px; line-height: 1.45; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.account-name { display: block; font-size: 12px; line-height: 1.6; color: var(--auth-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; margin-top: 2px; }
.is-pinned .account-name { color: #7b718e; }
.more-button { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; min-width: 44px; margin: 0 -9px 0 0; padding: 0; border-radius: 12px; background: transparent; }
.account-body { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
.code-button { display: flex; align-items: center; min-height: 44px; padding: 0; margin: 0; background: transparent; line-height: 1.2; border-radius: 8px; }
.account-code { font-family: Consolas, Menlo, monospace; font-size: 31px; font-weight: 700; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.account-code.eight-digits { font-size: 26px; letter-spacing: .2px; }
.code-button .app-icon { opacity: .45; }
.code-button text { margin-right: 10px; }
.unavailable-code { font-size: 15px; color: var(--auth-danger); }
.countdown { display: flex; align-items: center; flex-shrink: 0; font-size: 11px; color: #7d8376; }
.countdown text { margin-left: 5px; }
.is-pinned .countdown { color: #7e718d; }
.countdown.is-urgent { color: #ad7040; }
.timer-ring { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid #d9ded0; border-radius: 50%; }
.timer-center { width: 16px; height: 16px; background: #fff; border-radius: 50%; }
.is-pinned .timer-center { background: var(--auth-purple); }
.pin-note { display: flex; align-items: center; margin-top: 7px; color: #92819f; font-size: 10px; }
.pin-note text { margin-left: 4px; }
@media (max-width: 350px) { .account-code { font-size: 27px; } .account-code.eight-digits { font-size: 23px; } .code-button text { margin-right: 6px; } }
</style>
