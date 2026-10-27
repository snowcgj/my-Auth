<template>
  <view v-if="open" class="editor-layer">
    <view class="editor-backdrop" @click="$emit('cancel')" @touchmove.stop.prevent />
    <view class="editor-panel" role="dialog" aria-modal="true" aria-label="编辑账户名称" @click.stop @touchmove.stop>
      <view class="editor-handle" />
      <view class="editor-heading"><view class="editor-icon"><AppIcon name="edit" :size="21" /></view><view><text class="editor-title">编辑名称</text><text class="editor-subtitle">起个一眼就能认出的名字。</text></view></view>
      <text class="editor-label">服务名称</text>
      <input class="ui-input" :class="{ 'input-invalid': !checked.app }" :value="service" :maxlength="-1" :cursor-spacing="112" placeholder="例如 GitHub、公司邮箱" placeholder-class="ui-input-placeholder" aria-label="服务名称" @input="$emit('update-service', $event.detail.value)" />
      <text v-if="checked.appError" class="field-error">{{ checked.appError }}</text>
      <text class="editor-label">账户名称</text>
      <input class="ui-input" :class="{ 'input-invalid': !checked.name }" :value="account" :maxlength="-1" :cursor-spacing="112" confirm-type="done" placeholder="例如邮箱、用户名或工作账号" placeholder-class="ui-input-placeholder" aria-label="账户名称" @input="$emit('update-account', $event.detail.value)" @confirm="$emit('save')" />
      <text v-if="checked.nameError" class="field-error">{{ checked.nameError }}</text>
      <text class="editor-note">只修改显示名称，不影响验证码。</text>
      <text v-if="error" class="save-error" role="status">{{ error }}</text>
      <view class="editor-actions"><button class="ui-secondary editor-button" hover-class="ui-tap" @click="$emit('cancel')">取消</button><button class="ui-primary editor-button" :disabled="!canSave" hover-class="ui-tap" @click="$emit('save')">保存修改</button></view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { validateAccountNames } from '../utils/account.js';
const props = defineProps({
  open: { type: Boolean, default: false },
  service: { type: String, default: '' },
  account: { type: String, default: '' },
  originalService: { type: String, default: '' },
  originalAccount: { type: String, default: '' },
  error: { type: String, default: '' },
});
defineEmits(['cancel', 'save', 'update-service', 'update-account']);
const checked = computed(() => validateAccountNames(props.service, props.account));
const canSave = computed(() => checked.value.valid && (checked.value.app !== props.originalService || checked.value.name !== props.originalAccount));
</script>

<style scoped>
.editor-layer { position: fixed; inset: 0; z-index: 105; display: flex; align-items: flex-end; }
.editor-backdrop { position: absolute; inset: 0; background: var(--auth-mask); }
.editor-panel { position: relative; width: 100%; max-height: 88vh; overflow-y: auto; padding: 10px 22px 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom)); border-radius: 27px 27px 0 0; background: var(--auth-raised); }
.editor-handle { width: 34px; height: 4px; margin: 0 auto 23px; border-radius: 4px; background: var(--auth-handle); }
.editor-heading { display: flex; align-items: center; margin-bottom: 23px; }
.editor-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin-right: 12px; border-radius: 15px; background: var(--auth-purple); }
.editor-title { display: block; font-size: 21px; font-weight: 700; line-height: 1.5; }
.editor-subtitle { display: block; margin-top: 4px; font-size: 12px; line-height: 1.7; color: var(--auth-muted); }
.editor-label { display: block; margin: 17px 0 9px; font-size: 12px; color: var(--auth-muted); }
.input-invalid { border-color: #c9a095; }
.field-error { display: block; margin-top: 6px; font-size: 11px; color: var(--auth-danger); }
.editor-note { display: block; margin-top: 17px; color: var(--auth-muted); font-size: 11px; line-height: 1.8; }
.save-error { display: block; margin-top: 13px; padding: 10px 12px; color: var(--auth-danger); font-size: 12px; line-height: 1.8; background: var(--auth-danger-soft); border-radius: 11px; }
.editor-actions { display: flex; margin-top: 22px; }.editor-button { flex: 1; min-width: 0; }.editor-button + .editor-button { margin-left: 10px; }
</style>
