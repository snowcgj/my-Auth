<template>
  <view class="ui-page">
    <AppHeader title="设置" back @back="goBack" />
    <view class="ui-content">
      <view class="identity-panel"><image class="identity-image" src="/static/ui/brand.png" mode="aspectFit" /><view><text class="identity-title">Auth</text><text class="identity-description">验证码在手，登录更从容。</text></view></view>
      <text class="ui-section-label">数据</text>
      <view class="settings-group">
        <button class="settings-row" hover-class="ui-tap" @click="openBackup"><view class="row-icon purple-icon"><AppIcon name="lock" :size="21" /></view><view class="row-content"><text class="row-title">备份与恢复</text><text class="row-description">{{ backupSummary.title }}</text></view><AppIcon name="arrow" :size="16" /></button>
      </view>
      <text class="ui-section-label">关于</text>
      <view class="settings-group">
        <button class="settings-row" hover-class="ui-tap" @click="showHelp"><view class="row-icon"><AppIcon name="info" :size="21" /></view><view class="row-content"><text class="row-title">使用说明</text><text class="row-description">添加、复制与备份</text></view><AppIcon name="arrow" :size="16" /></button>
        <button class="settings-row" hover-class="ui-tap" @click="copyProjectLink"><view class="row-icon"><AppIcon name="code" :size="21" /></view><view class="row-content"><text class="row-title">开源项目</text><text class="row-description">复制 GitHub 项目地址</text></view><AppIcon name="copy" :size="16" /></button>
        <button class="settings-row" hover-class="ui-tap" @click="showPrivacy"><view class="row-icon"><AppIcon name="shield" :size="21" /></view><view class="row-content"><text class="row-title">数据与隐私</text><text class="row-description">了解账户如何保存</text></view><AppIcon name="arrow" :size="16" /></button>
      </view>
      <view class="version-note"><text>Auth · {{ version }}</text><text>离线生成 · 无需注册</text></view>
    </view>
    <AppDialog :open="!!dialogKind" :title="dialogKind === 'help' ? '使用说明' : '数据与隐私'" :icon="dialogKind === 'help' ? 'info' : 'shield'" @cancel="dialogKind = ''" @confirm="dialogKind = ''">
      <view v-for="item in dialogSections" :key="item.title" class="explanation-section"><text class="explanation-title">{{ item.title }}</text><text class="explanation-copy">{{ item.content }}</text></view>
    </AppDialog>
    <AppToast ref="notice" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import { onShow, onHide, onBackPress } from '@dcloudio/uni-app';
import AppHeader from '@/components/AppHeader.vue';
import AppIcon from '@/components/AppIcon.vue';
import AppDialog from '@/components/AppDialog.vue';
import AppToast from '@/components/AppToast.vue';
import { readBackupSummary } from '@/utils/backup-summary.js';
const backupSummary=ref({ title:'正在读取备份状态…' });
const version=ref('1.0.0');
const dialogKind = ref('');
const notice = ref(null);
const dialogSections = computed(() => dialogKind.value === 'help' ? [
  { title: '添加账户', content: '点击“添加账户”，扫描网站提供的验证二维码。' },
  { title: '使用验证码', content: '点击验证码即可复制。账户右上角菜单支持置顶和删除。' },
  { title: '换机前先备份', content: '在“备份与恢复”创建加密备份，在其他设备保留副本，并妥善保管密码。' },
] : [
  { title: '验证码在本地生成', content: '应用不会主动上传账户数据，生成验证码不需要联网。' },
  { title: '当前本地保护范围', content: '账户使用应用本地存储，尚未提供本地密钥加密或应用锁。' },
  { title: '导出备份使用密码加密', content: '保存位置由你选择。备份密码无法找回，遗忘后将无法恢复该文件。' },
]);
onHide(() => { dialogKind.value = ''; notice.value?.clear(); });
onBackPress(() => {
  if (!dialogKind.value) return false;
  dialogKind.value = '';
  return true;
});
onShow(()=>{
  backupSummary.value=readBackupSummary();
  try {
    if(typeof uni.getAppBaseInfo==='function') version.value=uni.getAppBaseInfo().appVersion || '1.0.0';
  } catch (_) { /* 旧运行容器保留 manifest 基线版本展示。 */ }
});
function goBack(){ if (dialogKind.value) dialogKind.value = ''; else uni.navigateBack(); }
function openBackup(){ uni.navigateTo({url:'/pages/backup/backup'}); }
function showHelp(){ notice.value?.clear(); dialogKind.value = 'help'; }
function copyProjectLink(){ uni.setClipboardData({data:'https://github.com/snowcgj/my-Auth',showToast:false,success:()=>notice.value?.show('项目地址已复制'),fail:()=>notice.value?.show('复制失败，请重试', 'error')}); }
function showPrivacy(){ notice.value?.clear(); dialogKind.value = 'privacy'; }
</script>

<style scoped>
.identity-panel { display:flex;align-items:center;padding:22px 20px;background:var(--auth-purple);border:1px solid #ded7f0;border-radius:22px; }
.identity-image { width:48px;height:50px;margin-right:16px; }
.identity-title { display:block;font-family:Arial,sans-serif;font-size:26px;font-weight:800; }
.identity-description { display:block;margin-top:7px;font-size:12px;color:#7b718e;line-height:1.7; }
.settings-group { background:#fff;border:1px solid var(--auth-line);border-radius:19px;padding:0 15px; }
.settings-row { display:flex;align-items:center;width:100%;min-height:82px;padding:15px 0;margin:0;background:transparent;border-radius:0;text-align:left;line-height:1.5; }
.settings-row + .settings-row { border-top:1px solid #eef0e7; }
.row-icon { display:flex;align-items:center;justify-content:center;width:38px;height:38px;flex-shrink:0;background:#f0f2e9;border-radius:12px; }
.purple-icon { background:#eee8fa; }
.row-content { flex:1;min-width:0;margin:0 12px; }
.row-title { display:block;font-size:14px;font-weight:500; }
.row-description { display:block;font-size:11px;color:var(--auth-muted);margin-top:5px;line-height:1.6; }
.version-note { display:flex;align-items:center;flex-direction:column;margin:34px 0 10px;font-size:11px;color:#929a86; }
.version-note text + text { margin-top:8px; }
.explanation-section + .explanation-section { margin-top: 17px; }
.explanation-title { display: block; font-size: 13px; font-weight: 600; line-height: 1.7; }
.explanation-copy { display: block; margin-top: 5px; font-size: 13px; color: var(--auth-muted); line-height: 1.9; }
</style>
