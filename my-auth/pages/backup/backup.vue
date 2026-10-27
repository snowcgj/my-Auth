<template>
  <view class="ui-page backup-page">
    <AppHeader :title="pageTitle" :subtitle="activePanel === 'overview' ? '为账户留一份退路。' : ''" back :disabled="busy" @back="goBack" />
    <view class="ui-content">
      <template v-if="activePanel === 'overview'">
        <view class="backup-hero"><image class="backup-art" src="/static/ui/empty-accounts.png" mode="aspectFit" /><view class="hero-copy"><text class="ui-title">备份在手，更安心</text><text class="ui-description">加密保存，自己保管。
换一部手机，账户也能带走。</text></view></view>
        <view class="status-card" :class="{ 'status-changed': backupStatus && backupStatus.changed }">
          <view class="status-label"><AppIcon name="lock" :size="15" /><text>备份状态</text></view>
          <template v-if="backupStatus && backupStatus.available"><text class="status-title">{{ backupStatus.changed ? '有更新，建议再备份一次' : '账户与上次导出一致' }}</text><text class="status-detail">最近导出 {{ backupStatus.lastExportAt }}</text><text class="status-detail">已导出 {{ backupStatus.exportedCount }} 个账户</text></template>
          <template v-else><text class="status-title">{{ backupStatus ? backupStatus.error : '正在读取状态…' }}</text><text class="status-detail">保留一份设备之外的副本，换机时更从容。</text></template>
        </view>
        <view class="backup-actions">
          <button class="backup-entry" hover-class="ui-tap" @click="showExport"><view class="entry-icon purple"><AppIcon name="backup" :size="23" /></view><view class="entry-copy"><text class="entry-title">创建加密备份</text><text class="entry-description">设置密码，保存当前账户</text></view><AppIcon name="arrow" :size="17" /></button>
          <button class="backup-entry" hover-class="ui-tap" @click="showRestore"><view class="entry-icon yellow"><AppIcon name="restore" :size="23" /></view><view class="entry-copy"><text class="entry-title">从文件恢复</text><text class="entry-description">选择备份，确认后合并账户</text></view><AppIcon name="arrow" :size="17" /></button>
        </view>
        <text class="privacy-description">保存位置由你选择，应用不会主动上传账户数据。</text>
      </template>
      <view v-else-if="activePanel === 'export'" class="ui-panel form-panel">
        <text class="ui-title">给备份设置密码</text><text class="ui-description form-description">当前账户将保存为加密文件。恢复时需要输入相同密码。</text>
        <text class="field-label">备份密码</text><input :value="exportPassword" @input="onExportPasswordInput" password type="text" placeholder="输入备份密码" placeholder-class="ui-input-placeholder" class="ui-input" :disabled="busy" />
        <text class="field-label">确认密码</text><input :value="exportPasswordConfirm" @input="onExportPasswordConfirmInput" password type="text" placeholder="再次输入密码" placeholder-class="ui-input-placeholder" class="ui-input" :disabled="busy" />
        <text class="ui-note password-note">请妥善保管密码。密码无法找回，遗忘后将无法恢复这份备份。</text>
        <button class="ui-primary form-submit" :disabled="busy" hover-class="ui-tap" @click="onCreateBackup"><AppIcon name="lock" :size="17" light /><text class="ui-button-label">{{ busy ? '处理中…' : '加密并选择保存位置' }}</text></button>
      </view>
      <template v-else>
        <view class="ui-panel form-panel">
          <text class="ui-title">选择你的备份文件</text><text class="ui-description form-description">支持本应用导出的 .mabak 文件。预览确认之前，不会更改已有账户。</text>
          <button class="ui-secondary" :disabled="busy" hover-class="ui-tap" @click="onSelectFile"><AppIcon name="restore" :size="18" /><text class="ui-button-label">{{ busy && busyKind === 'read' ? '正在读取…' : restoreStep === 'idle' ? '选择备份文件' : '重新选择文件' }}</text></button>
          <view v-if="restoreStep === 'fileSelected'" class="decrypt-form"><text class="file-note">已读取 {{ restoreFileBytes }} 字节</text><text class="field-label">备份密码</text><input :value="restorePassword" @input="onRestorePasswordInput" password type="text" placeholder="输入创建备份时的密码" placeholder-class="ui-input-placeholder" class="ui-input" :disabled="busy" /><button class="ui-primary form-submit" :disabled="busy" hover-class="ui-tap" @click="onDecryptPreview">{{ busy ? '正在解密…' : '解密并预览' }}</button></view>
        </view>
        <view v-if="restoreStep === 'previewed' && preview" class="ui-panel preview-panel">
          <text class="ui-title">确认要恢复的账户</text><text class="ui-description form-description">备份含 {{ preview.decryptedCount }} 个账户。已有的重复账户将保留。</text>
          <view class="merge-counts"><view><text class="count-number">{{ preview.added }}</text><text class="count-label">新增账户</text></view><view><text class="count-number muted-count">{{ preview.duplicates.length }}</text><text class="count-label">重复跳过</text></view></view>
          <view v-for="(account, index) in preview.labels" :key="index" class="preview-account"><text class="preview-service">{{ account.service }}</text><text class="preview-name">{{ account.name }}</text></view><text v-if="preview.decryptedCount > 8" class="file-note">另有 {{ preview.decryptedCount - 8 }} 个账户，确认后按上述数量合并。</text>
          <button class="ui-primary form-submit" :disabled="busy" hover-class="ui-tap" @click="onConfirmMerge">{{ busy ? '正在合并…' : '确认合并账户' }}</button><button class="ui-secondary cancel-restore" :disabled="busy" @click="onCancelRestore">取消恢复</button>
        </view>
      </template>
      <view v-if="message" class="operation-message" :class="messageKind" role="status"><text>{{ message }}</text></view>
    </view>
    <BusyOverlay :open="busy" :title="busyTitle" :description="busyDescription" />
  </view>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue';
import AppIcon from '@/components/AppIcon.vue';
import BusyOverlay from '@/components/BusyOverlay.vue';
import { waitForFeedback } from '@/utils/feedback-render.js';

import { createBackup, openBackup, BackupError } from '@/utils/backup-crypto.js';
import { mergeAccounts, buildAccountFingerprint } from '@/utils/backup-merge.js';
import { getRandomBytes } from '@/utils/platform-random.js';
import { pickFileForSave, pickFileForRead } from '@/utils/platform-file.js';

const BACKUP_META_KEY = 'backup_meta';
const MAX_ACCOUNTS = 10000; // 防御：异常大的账户数视为损坏

function formatTime(iso) {
  if (!iso) return '未知';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch {
    return '未知';
  }
}

export default {
  components: { AppHeader, AppIcon, BusyOverlay },
  data() {
    return {
      activePanel: 'overview',
      busy: false,
      busyKind: '', // 'export' | 'save' | 'read' | 'decrypt' | 'merge'
      operationSerial: 0,
      pageDisposed: false,
      // 备份状态
      backupStatus: null, // null=未加载；{ available, lastExportAt, exportedCount, changed, error }
      // 创建备份
      exportPassword: '',
      exportPasswordConfirm: '',
      // 恢复
      restoreStep: 'idle', // 'idle' | 'fileSelected' | 'previewed'
      restoreFileContent: '',
      restoreFileBytes: 0,
      restorePassword: '',
      preview: null, // { added, duplicates, decryptedCount }
      // 消息
      message: '',
      messageKind: '', // '' | 'ok' | 'error'
    };
  },
  onLoad(options) {
    if (options.intent === 'restore') this.activePanel = 'restore';
  },
  onBackPress() {
    if (this.busy) return true;
    if (this.activePanel !== 'overview') { this.goOverview(); return true; }
    return false;
  },
  onUnload() {
    this.pageDisposed = true;
    this.operationSerial += 1;
    this.busy = false;
    this.busyKind = '';
    this.clearPasswords();
    this.preview = null;
    this.restoreFileContent = '';
  },
  computed: {
    pageTitle() { return this.activePanel === 'export' ? '创建加密备份' : this.activePanel === 'restore' ? '恢复账户' : '备份与恢复'; },
    busyTitle() {
      return { export: '正在加密备份', save: '等待保存与校验', read: '选择并读取备份', decrypt: '正在解密备份', merge: '正在恢复账户' }[this.busyKind] || '正在处理';
    },
    busyDescription() {
      if (this.busyKind === 'save') return '请在系统窗口选择保存位置。文件写入后会自动读回校验。';
      if (this.busyKind === 'read') return '请在系统窗口选择备份文件，返回后会读取内容。';
      if (this.busyKind === 'merge') return '正在重新验证备份，并合并到当前账户。已有的重复账户会保留。';
      return '密码保护需要几秒钟，请保持应用在前台。';
    },
  },
  onShow() {
    // 页面重新显示或从系统文件选择器返回时刷新备份状态。
    this.refreshBackupStatus();
  },
  methods: {
    async prepareFeedback() {
      const operation = ++this.operationSerial;
      await waitForFeedback(() => this.$nextTick());
      return this.isOperationCurrent(operation) ? operation : null;
    },
    isOperationCurrent(operation) { return !this.pageDisposed && operation === this.operationSerial; },
    finishFeedback(operation) {
      if (!this.isOperationCurrent(operation)) return;
      this.busy = false;
      this.busyKind = '';
    },
    goBack() {
      if (this.busy) return;
      if (this.activePanel !== 'overview') this.goOverview();
      else uni.navigateBack();
    },
    goOverview() {
      if (this.busy) return;
      this.activePanel = 'overview';
      this.preview = null;
      this.restoreStep = 'idle';
      this.restoreFileContent = '';
      this.restoreFileBytes = 0;
      this.clearPasswords();
      this.setMessage('', '');
    },
    showExport() { this.goOverview(); this.activePanel = 'export'; },
    showRestore() { this.goOverview(); this.activePanel = 'restore'; },
    setMessage(text, kind) {
      this.message = text;
      this.messageKind = kind || '';
    },
    clearPasswords() {
      // 操作完成后清除内存中的密码，缩短敏感数据驻留时间
      this.exportPassword = '';
      this.exportPasswordConfirm = '';
      this.restorePassword = '';
    },
    // 刷新备份状态：读 backup_meta + 计算当前指纹比对。
    // 读取失败显示"状态不可用"，不伪造"已备份"。
    refreshBackupStatus() {
      let meta;
      try {
        meta = uni.getStorageSync(BACKUP_META_KEY);
      } catch (e) {
        this.backupStatus = { available: false, error: '状态不可用（读取失败）' };
        return;
      }
      if (!meta || typeof meta !== 'object' || !meta.lastExportAt) {
        this.backupStatus = { available: false, error: '尚未创建备份' };
        return;
      }
      // 计算当前指纹 vs 导出时指纹，判断是否有变更
      const read = this.readExistingAccounts();
      if (!read.ok) {
        this.backupStatus = { available: false, error: '状态不可用（账户存储异常）' };
        return;
      }
      const currentFingerprint = buildAccountFingerprint(read.accounts);
      this.backupStatus = {
        available: true,
        lastExportAt: formatTime(meta.lastExportAt),
        exportedCount: meta.exportedCount || 0,
        changed: currentFingerprint !== meta.fingerprint,
      };
    },
    // 读取现有账户：区分键不存在（正常空）与存储损坏（报错）。
    // 返回 { ok, accounts, error }。ok=false 时调用方必须终止，不按空数组继续。
    readExistingAccounts() {
      let stored;
      try {
        stored = uni.getStorageSync('accounts');
      } catch (e) {
        return { ok: false, error: '读取账户存储失败：' + (e.message || e) };
      }
      if (stored === '' || stored === null || stored === undefined) {
        // 键不存在，视为空账户列表（正常）
        return { ok: true, accounts: [] };
      }
      if (!Array.isArray(stored)) {
        // 存在但非数组，损坏
        return { ok: false, error: '账户存储数据结构异常（非数组），已终止' };
      }
      if (stored.length > MAX_ACCOUNTS) {
        return { ok: false, error: '账户存储数量异常（超过上限），已终止' };
      }
      return { ok: true, accounts: stored };
    },

    // 创建备份输入处理（不用 v-model，真机兼容）
    onExportPasswordInput(event) {
      this.exportPassword = event.detail.value;
    },
    onExportPasswordConfirmInput(event) {
      this.exportPasswordConfirm = event.detail.value;
    },
    onRestorePasswordInput(event) {
      this.restorePassword = event.detail.value;
    },

    // 先让等待反馈有机会绘制；仍沿用同步密码学与原生文件接口。
    async onCreateBackup() {
      if (this.busy || this.pageDisposed) return;
      if (!this.exportPassword) { this.setMessage('请输入备份密码', 'error'); return; }
      if (this.exportPassword !== this.exportPasswordConfirm) { this.setMessage('两次输入的密码不一致', 'error'); return; }
      const read = this.readExistingAccounts();
      if (!read.ok) { this.setMessage(read.error, 'error'); return; }
      if (!read.accounts.length) { this.setMessage('没有可备份的账户', 'error'); return; }

      this.busy = true;
      this.busyKind = 'export';
      this.setMessage('正在加密…', '');
      const operation = await this.prepareFeedback();
      if (operation === null) return;
      let stage = 'encrypt';
      try {
        const backup = createBackup(this.exportPassword, read.accounts, { randomBytes: getRandomBytes });
        const json = JSON.stringify(backup);
        stage = 'save';
        this.busyKind = 'save';
        this.setMessage('加密完成，请选择保存位置…', '');
        await waitForFeedback(() => this.$nextTick());
        if (!this.isOperationCurrent(operation)) return;
        const res = await new Promise(resolve => pickFileForSave('my-auth-backup.mabak', json, resolve));
        if (!this.isOperationCurrent(operation)) return;
        if (res.cancelled) { this.setMessage('已取消，未导出', ''); return; }
        if (res.error) { this.setMessage('写入失败，请重试（原账户不变）', 'error'); return; }
        if (!res.verified) { this.setMessage('写入后读回验证未通过，未记录导出状态', 'error'); return; }
        stage = 'done';

        // 只有文件验证成功才记录导出状态；meta 失败与文件失败分开说明。
        let metaWritten = false;
        try {
          uni.setStorageSync(BACKUP_META_KEY, {
            lastExportAt: new Date().toISOString(),
            exportedCount: read.accounts.length,
            fingerprint: buildAccountFingerprint(read.accounts),
          });
          metaWritten = true;
        } catch (_) { /* 文件本身已成功，状态记录失败不改账户。 */ }
        if (metaWritten) {
          this.setMessage('导出成功，' + res.bytes + ' 字节，读回验证通过', 'ok');
          this.refreshBackupStatus();
        } else {
          this.backupStatus = { available: false, error: '状态不可用（记录失败）' };
          this.setMessage('导出成功（' + res.bytes + ' 字节），但状态记录失败，备份状态不可用', 'ok');
        }
      } catch (error) {
        if (!this.isOperationCurrent(operation)) return;
        const code = error instanceof BackupError ? error.code : '';
        if (stage === 'done') this.setMessage('文件已导出并验证，但备份状态暂时无法刷新', 'ok');
        else this.setMessage(stage === 'encrypt' ? '加密失败' + (code ? '（' + code + '）' : '') + '，未导出' : '无法完成文件保存，请重试（原账户不变）', 'error');
      } finally {
        if (this.isOperationCurrent(operation)) this.clearPasswords();
        this.finishFeedback(operation);
      }
    },

    async onSelectFile() {
      if (this.busy || this.pageDisposed) return;
      this.restoreStep = 'idle';
      this.preview = null;
      this.restorePassword = '';
      this.restoreFileContent = '';
      this.restoreFileBytes = 0;
      this.setMessage('', '');
      this.busy = true;
      this.busyKind = 'read';
      const operation = await this.prepareFeedback();
      if (operation === null) return;
      try {
        const res = await new Promise(resolve => pickFileForRead(resolve));
        if (!this.isOperationCurrent(operation)) return;
        if (res.cancelled) { this.setMessage('已取消选择文件', ''); return; }
        if (res.error) { this.setMessage('读取文件失败：' + res.error + '（原账户不变）', 'error'); return; }
        this.restoreFileContent = res.content;
        this.restoreFileBytes = res.bytes;
        this.restoreStep = 'fileSelected';
        this.setMessage('已读取 ' + res.bytes + ' 字节，请输入密码', '');
      } catch (_) {
        if (this.isOperationCurrent(operation)) this.setMessage('无法打开备份文件，请重试（原账户不变）', 'error');
      } finally { this.finishFeedback(operation); }
    },

    // 预览不保存解密后的完整账户，确认时仍重新解密。
    async onDecryptPreview() {
      if (this.busy || this.pageDisposed) return;
      if (!this.restoreFileContent) { this.setMessage('请先选择备份文件', 'error'); return; }
      if (!this.restorePassword) { this.setMessage('请输入备份密码', 'error'); return; }
      this.busy = true;
      this.busyKind = 'decrypt';
      this.setMessage('正在解密…', '');
      const operation = await this.prepareFeedback();
      if (operation === null) return;
      try {
        const result = openBackup(this.restorePassword, this.restoreFileContent);
        const read = this.readExistingAccounts();
        if (!read.ok) { this.setMessage(read.error, 'error'); return; }
        const merge = mergeAccounts(read.accounts, result.accounts);
        this.preview = {
          added: merge.added,
          duplicates: merge.duplicates,
          decryptedCount: result.accounts.length,
          labels: result.accounts.slice(0, 8).map(account => ({
            service: account.app || account.issuer || '账户',
            name: account.name || account.accountName || '',
          })),
        };
        this.restoreStep = 'previewed';
        this.setMessage('解密成功：备份含 ' + result.accounts.length + ' 个账户，可新增 ' + merge.added + ' 个', '');
      } catch (error) {
        const code = error instanceof BackupError ? error.code : '';
        const friendly = code === 'PASSWORD_OR_CORRUPT' ? '密码错误或备份文件已损坏'
          : code === 'FORMAT_INVALID' ? '备份文件格式无效'
          : code === 'VERSION_UNSUPPORTED' ? '备份版本不支持，请升级应用' : '解密预览失败';
        this.setMessage(friendly + '（原账户不变）', 'error');
      } finally { this.finishFeedback(operation); }
    },

    async onConfirmMerge() {
      if (this.busy || this.pageDisposed || !this.preview) return;
      this.busy = true;
      this.busyKind = 'merge';
      this.setMessage('正在恢复账户…', '');
      const operation = await this.prepareFeedback();
      if (operation === null) return;
      let stage = 'decrypt';
      try {
        const result = openBackup(this.restorePassword, this.restoreFileContent);
        // 在等待与解密之后重读，避免这段时间的现有账户变化被覆盖。
        const read = this.readExistingAccounts();
        if (!read.ok) { this.setMessage(read.error + '（原账户不变）', 'error'); return; }
        stage = 'merge';
        const baseId = Date.now();
        const incoming = result.accounts.map((account, index) => ({ ...account, id: baseId + index }));
        const merge = mergeAccounts(read.accounts, incoming);
        stage = 'write';
        uni.setStorageSync('accounts', merge.merged);
        stage = 'done';
        this.setMessage('恢复完成：新增 ' + merge.added + ' 个，跳过 ' + merge.duplicates.length + ' 个重复，当前共 ' + merge.merged.length + ' 个', 'ok');
        this.preview = null;
        this.restoreStep = 'idle';
        this.restoreFileContent = '';
        this.restoreFileBytes = 0;
        this.clearPasswords();
        this.refreshBackupStatus();
      } catch (_) {
        if (stage === 'done') this.setMessage('账户已恢复，但备份状态暂时无法刷新', 'ok');
        else {
          const message = stage === 'decrypt' ? '重新解密失败' : stage === 'write' ? '写入存储失败' : '账户合并失败';
          this.setMessage(message + '（原账户不变）', 'error');
          if (stage === 'write') this.clearPasswords();
        }
      } finally { this.finishFeedback(operation); }
    },

    onCancelRestore() {
      if (this.busy) return;
      this.preview = null;
      this.restoreStep = 'idle';
      this.restoreFileContent = '';
      this.restoreFileBytes = 0;
      this.restorePassword = '';
      this.setMessage('已取消恢复（原账户不变）', '');
    },
  },
};
</script>

<style scoped>
.backup-hero { display:flex;align-items:center;padding:4px 3px 24px; }
.backup-art { width:114px;height:120px;flex-shrink:0;margin-right:14px; }
.hero-copy { flex:1;min-width:0; }
.hero-copy .ui-title { font-size:21px; }
.hero-copy .ui-description { margin-top:9px;white-space:pre-line;font-size:12px; }
.status-card { padding:18px 19px;background:var(--auth-purple);border:1px solid #ded7f0;border-radius:19px;margin-bottom:20px; }
.status-changed { background:#f5efdb;border-color:#ebe3c8; }
.status-label { display:flex;align-items:center;font-size:11px;color:#81748f;margin-bottom:12px; }
.status-label text { margin-left:6px; }
.status-title { display:block;font-size:16px;line-height:1.65;font-weight:600; }
.status-detail { display:block;margin-top:7px;color:#81788a;font-size:11px;line-height:1.8; }
.status-changed .status-detail,.status-changed .status-label { color:#8c7b53; }
.backup-actions { background:#fff;border:1px solid var(--auth-line);border-radius:20px;padding:0 16px; }
.backup-entry { display:flex;align-items:center;width:100%;min-height:92px;margin:0;padding:17px 0;background:transparent;text-align:left;line-height:1.5;border-radius:0; }
.backup-entry + .backup-entry { border-top:1px solid var(--auth-line); }
.entry-icon { display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;flex-shrink:0; }
.entry-icon.purple { background:#eee8fa; }.entry-icon.yellow { background:#f7edbd; }
.entry-copy { flex:1;min-width:0;margin:0 12px; }.entry-title { display:block;font-size:15px;font-weight:600; }.entry-description { display:block;font-size:11px;color:var(--auth-muted);margin-top:6px;line-height:1.8; }
.privacy-description { display:block;margin:22px 8px 0;text-align:center;font-size:11px;color:#8f9881;line-height:1.9; }
.form-description { margin-top:10px;margin-bottom:20px; }.field-label { display:block;margin:18px 0 9px;font-size:12px;color:#6e7663; }
.password-note { margin-top:18px; }.form-submit { width:100%;margin-top:22px; }.file-note { display:block;font-size:11px;line-height:1.8;color:var(--auth-muted);margin-top:14px; }
.merge-counts { display:flex;justify-content:space-around;padding:19px 10px;margin-bottom:12px;background:#f0edf8;border-radius:14px;text-align:center; }.count-number { display:block;font-family:Consolas,monospace;font-size:28px;font-weight:700; }.count-label { display:block;font-size:11px;margin-top:5px;color:#81758e; }.muted-count { color:#92899e; }
.preview-account { padding:13px 0;border-bottom:1px solid var(--auth-line); }.preview-service { display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere; }.preview-name { display:block;font-size:11px;color:var(--auth-muted);margin-top:5px;overflow-wrap:anywhere; }.cancel-restore { margin-top:10px; }
.operation-message { padding:14px 16px;margin-top:16px;background:#ecefe5;border-radius:14px;font-size:12px;line-height:1.9;color:#67735b;overflow-wrap:anywhere; }.operation-message.ok { background:#e6eedf;color:#4c6745; }.operation-message.error { background:#f6e8e2;color:#9b5946; }
@media(max-width:350px){ .backup-art{width:90px;height:106px;margin-right:10px}.hero-copy .ui-title{font-size:19px} }
</style>
