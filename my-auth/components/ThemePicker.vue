<template>
  <view v-if="open" class="theme-overlay">
    <view class="theme-backdrop" @click="$emit('close')" @touchmove.stop.prevent />
    <view class="theme-panel" role="dialog" aria-modal="true" aria-label="切换背景" @click.stop @touchmove.stop>
      <view class="theme-handle" />
      <view class="theme-heading"><view><text class="theme-title">换个背景，换份心情</text><text class="theme-subtitle">三种浅色，选一个舒服的。</text></view><view class="theme-symbol"><AppIcon name="palette" :size="23" /></view></view>
      <view class="theme-options">
        <button v-for="theme in themes" :key="theme.id" class="theme-option" :class="{ 'is-selected': selected === theme.id }" :aria-label="theme.label" :aria-pressed="selected === theme.id" hover-class="ui-tap" @click="$emit('select', theme.id)">
          <view class="theme-preview" :style="getThemeStyle(theme.id)"><view class="preview-bar" /><view class="preview-card"><view class="preview-avatar" /><view class="preview-line" /></view><view class="preview-card"><view class="preview-avatar light-avatar" /><view class="preview-line" /></view><view v-if="selected === theme.id" class="theme-check"><AppIcon name="check" :size="12" light /></view></view>
          <text class="theme-name">{{ theme.label }}</text><text class="theme-description">{{ theme.description }}</text>
        </button>
      </view>
      <text v-if="error" class="theme-error" role="status">{{ error }}</text>
      <text class="theme-note">所有页面同步使用，下次打开也会保留。</text>
      <button class="ui-secondary theme-close" hover-class="ui-tap" @click="$emit('close')">完成</button>
    </view>
  </view>
</template>

<script setup>
import AppIcon from './AppIcon.vue';
import { THEMES as themes, getThemeStyle } from '../utils/theme.js';
defineProps({ open: { type: Boolean, default: false }, selected: { type: String, default: 'warm' }, error: { type: String, default: '' } });
defineEmits(['select', 'close']);
</script>

<style scoped>
.theme-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: flex-end; }
.theme-backdrop { position: absolute; inset: 0; background: var(--auth-mask); }
.theme-panel { position: relative; width: 100%; padding: 10px 22px 22px; padding-bottom: calc(22px + env(safe-area-inset-bottom)); background: var(--auth-raised); border-radius: 27px 27px 0 0; }
.theme-handle { width: 34px; height: 4px; margin: 0 auto 26px; background: var(--auth-handle); border-radius: 4px; }
.theme-heading { display: flex; align-items: center; justify-content: space-between; }
.theme-title { display: block; font-size: 20px; font-weight: 700; line-height: 1.6; }
.theme-subtitle { display: block; margin-top: 7px; font-size: 12px; color: var(--auth-muted); line-height: 1.7; }
.theme-symbol { display: flex; align-items: center; justify-content: center; width: 43px; height: 43px; margin-left: 10px; border-radius: 15px; background: var(--auth-purple); flex-shrink: 0; }
.theme-options { display: flex; margin: 25px -5px 0; }
.theme-option { flex: 1; min-width: 0; margin: 0 5px; padding: 0; text-align: left; background: transparent; line-height: 1.5; }
.theme-preview { position: relative; height: 124px; padding: 15px 10px; background: var(--auth-paper); border: 2px solid var(--auth-line); border-radius: 18px; }
.is-selected .theme-preview { border-color: var(--auth-ink); }
.preview-bar { width: 28px; height: 5px; margin-bottom: 12px; background: #454940; border-radius: 3px; }
.preview-card { display: flex; align-items: center; height: 29px; margin-bottom: 6px; padding: 5px; background: #fff; border-radius: 7px; }
.preview-avatar { width: 15px; height: 15px; background: #e9e4fa; border-radius: 5px; flex-shrink: 0; }.light-avatar { background: #e7eddc; }
.preview-line { width: 24px; height: 3px; margin-left: 5px; background: #cbd0c2; border-radius: 2px; }
.theme-check { position: absolute; right: 7px; bottom: 7px; width: 21px; height: 21px; display: flex; align-items: center; justify-content: center; background: var(--auth-ink); border-radius: 50%; }
.theme-name { display: block; margin: 10px 2px 0; font-size: 14px; font-weight: 600; }.theme-description { display: block; margin: 4px 2px 0; font-size: 11px; color: var(--auth-muted); }
.theme-note { display: block; margin-top: 23px; font-size: 11px; line-height: 1.8; color: var(--auth-muted); }.theme-close { width: 100%; margin-top: 17px; }
.theme-error { display: block; margin-top: 16px; padding: 10px 12px; background: var(--auth-danger-soft); color: var(--auth-danger); border-radius: 11px; font-size: 12px; line-height: 1.8; }
@media (max-height: 550px) { .theme-panel { max-height: 90vh; overflow-y: auto; }.theme-handle { margin-bottom: 14px; }.theme-options { margin-top: 16px; }.theme-preview { height: 108px; } }
</style>
