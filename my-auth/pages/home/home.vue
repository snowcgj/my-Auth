<template>
  <view class="ui-page home-page">
    <AppHeader title="Auth" subtitle="你的账户，随时就绪。" brand>
      <button class="ui-icon-button" aria-label="打开设置" hover-class="ui-tap" @click="openSettings"><AppIcon name="settings" :size="20" /></button>
    </AppHeader>
    <view class="ui-content home-content">
      <view v-if="accounts.length || keyword" class="search-box">
        <AppIcon name="search" :size="18" />
        <input class="search-input" :value="keyword" placeholder="搜索服务或账户" placeholder-class="ui-input-placeholder" confirm-type="search" @input="onSearchInput" />
        <button v-if="keyword" class="clear-search" aria-label="清空搜索" @click="keyword = ''"><AppIcon name="close" :size="16" /></button>
      </view>
      <button v-if="accounts.length && !loadError && backupSummary.state !== 'current'" class="backup-notice" hover-class="ui-tap" @click="openBackup">
        <AppIcon name="lock" :size="15" /><text>{{ backupSummary.title }}</text><AppIcon name="arrow" :size="14" />
      </button>
      <view v-if="loadError" class="empty-state error-state">
        <text class="empty-title">暂时无法读取账户</text><text class="empty-description">原有数据未被覆盖，请稍后重试。</text>
        <button class="ui-primary empty-action" @click="loadAccounts">重新读取</button>
      </view>
      <view v-else-if="loading" class="loading-tip"><text>正在读取账户…</text></view>
      <view v-else-if="accounts.length === 0" class="empty-state">
        <image class="empty-illustration" src="/static/ui/empty-accounts.png" mode="aspectFit" />
        <text class="empty-title">从第一个账户开始</text>
        <text class="empty-description">扫描网站提供的验证二维码
下次登录，验证码就在这里。</text>
        <button class="ui-primary empty-action" hover-class="ui-tap" @click="scanQRCode"><AppIcon name="scan" :size="18" light /><text class="ui-button-label">扫描二维码</text></button>
        <button v-if="imageImportAvailable" class="restore-link image-link" hover-class="ui-tap" @click="onImportImage"><AppIcon name="image" :size="17" /><text>从相册识别</text></button>
        <button class="restore-link" hover-class="ui-tap" @click="openRestore">已有备份？从文件恢复</button>
        <view class="privacy-note"><AppIcon name="lock" :size="13" /><text>验证码可离线生成 · 无需注册</text></view>
      </view>
      <view v-else-if="displayAccounts.length === 0" class="search-empty">
        <AppIcon name="search" :size="28" /><text class="empty-title small-title">没有找到匹配的账户</text>
        <text class="empty-description">试试服务名或账户邮箱。</text><button class="restore-link" @click="keyword = ''">清空搜索</button>
      </view>
      <view v-else>
        <text v-if="keyword" class="result-label">找到 {{ displayAccounts.length }} 个账户</text>
        <template v-for="group in accountGroups" :key="group.key">
          <view v-if="!keyword" class="group-heading"><AppIcon v-if="group.key === 'pinned'" name="pin" :size="12" /><text>{{ group.label }}</text><text class="group-count">{{ group.accounts.length }}</text></view>
          <AccountItem v-for="account in group.accounts" :key="account.id" :id="account.id" :icon="account.icon" :app="account.app" :name="account.name" :secret="account.secret" :digits="account.digits" :period="account.period" :algorithm="account.algorithm" :pinned="account.pinned" :timestamp-seconds="now" @delete-account="onDeleteAccount" @toggle-pin="onTogglePin" @more-options="menuAccountId = $event" @notify="showNotice" />
        </template>
      </view>
    </view>
    <button v-if="accounts.length && !loadError" class="add-account" hover-class="ui-tap" @click="onAddAccount"><AppIcon name="plus" :size="20" light /><text>添加账户</text></button>
    <ActionSheet :open="addSheetOpen" title="添加账户" subtitle="扫描验证二维码，或从图片中识别。" :actions="addActions" @close="addSheetOpen = false" @select="onAddAction" />
    <ActionSheet :open="!!menuAccount" :title="menuAccount ? menuAccount.app : '账户'" :subtitle="menuAccount ? menuAccount.name : ''" :actions="accountActions" @close="menuAccountId = null" @select="onAccountAction" />
    <AccountNameEditor :open="!!editDraft" :service="editDraft ? editDraft.app : ''" :account="editDraft ? editDraft.name : ''" :original-service="editDraft ? editDraft.originalApp : ''" :original-account="editDraft ? editDraft.originalName : ''" :error="editError" @update-service="updateEditName('app', $event)" @update-account="updateEditName('name', $event)" @cancel="closeNameEditor" @save="saveAccountNames" />
    <AppDialog :open="!!dialog" :title="dialog ? dialog.title : ''" :description="dialog ? dialog.description : ''" :icon="dialog && dialog.type === 'delete' ? 'trash' : 'info'" :danger="!!dialog && dialog.type === 'delete'" :show-cancel="!!dialog && dialog.type === 'delete'" :confirm-text="dialog && dialog.type === 'delete' ? '删除账户' : '知道了'" @cancel="dialog = null" @confirm="onDialogConfirm">
      <template v-if="dialog && dialog.type === 'delete'">
        <view class="delete-identity"><text class="delete-service">{{ dialog.service }}</text><text class="delete-name">{{ dialog.name }}</text></view>
        <text class="dialog-copy">删除后，将无法在本机生成该账户的验证码。请确认已保留其他验证方式或可恢复的备份。</text>
      </template>
      <text v-else-if="dialog" class="dialog-copy">{{ dialog.description }}</text>
    </AppDialog>
    <AppToast ref="notice" />
    <BusyOverlay :open="imageBusy" :title="imageBusyTitle" :description="imageBusyDescription" icon="image" />
  </view>
</template>

<script>
import AccountItem from '@/components/AccountItem.vue';
import AppHeader from '@/components/AppHeader.vue';
import AppIcon from '@/components/AppIcon.vue';
import ActionSheet from '@/components/ActionSheet.vue';
import AppDialog from '@/components/AppDialog.vue';
import AppToast from '@/components/AppToast.vue';
import BusyOverlay from '@/components/BusyOverlay.vue';
import AccountNameEditor from '@/components/AccountNameEditor.vue';
import { scanSystemImage, supportsSystemImageScan } from '@/utils/platform-image.js';
import { waitForFeedback } from '@/utils/feedback-render.js';
import { parseOtpAuthUri } from '@/utils/otpauth.js';
import { normalizeAccount, renameAccount, validateAccountNames } from '@/utils/account.js';
import { readBackupSummary } from '@/utils/backup-summary.js';

export default {
  components: { AccountItem, AppHeader, AppIcon, ActionSheet, AppDialog, AppToast, BusyOverlay, AccountNameEditor },
  data() {
    return {
      now: Math.floor(Date.now() / 1000), timer: null, keyword: '', accounts: [],
      loading: true, loadError: '', pageVisible: false, addSheetOpen: false, menuAccountId: null,
      dialog: null,
      editDraft: null, editError: '',
      imageImportAvailable: false, imageBusy: false, imageStage: 'pick', imageOperation: 0, homeDisposed: false,
      backupSummary: { state: 'unavailable', title: '备份状态暂不可用' },
    };
  },
  onShow() {
    this.imageImportAvailable = supportsSystemImageScan();
    this.pageVisible = true;
    this.now = Math.floor(Date.now() / 1000);
    this.loadAccounts();
    this.startClock();
  },
  onHide() { this.pageVisible = false; this.stopClock(); this.addSheetOpen = false; this.menuAccountId = null; this.dialog = null; this.closeNameEditor(); this.$refs.notice?.clear(); },
  onUnload() { this.pageVisible = false; this.stopClock(); this.invalidateImageImport(); },
  beforeUnmount() { this.pageVisible = false; this.stopClock(); this.invalidateImageImport(); },
  onBackPress() {
    if (this.imageBusy) return true;
    if (this.editDraft) { this.closeNameEditor(); return true; }
    if (this.dialog) { this.dialog = null; return true; }
    if (this.menuAccountId !== null) { this.menuAccountId = null; return true; }
    if (this.addSheetOpen) { this.addSheetOpen = false; return true; }
    return false;
  },
  watch: {
    // 只刷新展示摘要，不使用深度 watcher 或自动保存。
    accounts() { this.backupSummary = readBackupSummary(this.accounts); },
  },
  computed: {
    addActions() {
      const actions = [{ value: 'scan', label: '扫描二维码', icon: 'scan' }];
      if (this.imageImportAvailable) actions.push({ value: 'image', label: '从相册识别', icon: 'image' });
      return actions;
    },
    imageBusyTitle() { return { pick: '选择二维码图片', read: '正在读取图片', recognize: '正在识别二维码' }[this.imageStage]; },
    imageBusyDescription() { return this.imageStage === 'pick' ? '请在系统窗口选择一张二维码图片。' : '图片仅在本机处理，不会上传。请稍候。'; },
    menuAccount() { return this.accounts.find(account => account.id === this.menuAccountId) || null; },
    accountActions() {
      return [
        { value: 'edit', label: '编辑名称', icon: 'edit' },
        { value: 'pin', label: this.menuAccount && this.menuAccount.pinned ? '取消置顶' : '置顶账户', icon: 'pin' },
        { value: 'delete', label: '删除账户', icon: 'trash', danger: true },
      ];
    },
    displayAccounts() {
      const keyword = this.keyword.trim().toLowerCase();
      const filtered = keyword ? this.accounts.filter(account =>
        [account.app, account.name, account.issuer, account.accountName].filter(Boolean).join(' ').toLowerCase().includes(keyword)
      ) : this.accounts.slice();
      return filtered.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.id - b.id);
    },
    accountGroups() {
      const pinned = this.displayAccounts.filter(account => account.pinned);
      const others = this.displayAccounts.filter(account => !account.pinned);
      return [
        { key: 'pinned', label: '置顶', accounts: pinned },
        { key: 'all', label: '全部账户', accounts: others },
      ].filter(group => group.accounts.length);
    },
  },
  methods: {
    openNameEditor(accountId) {
      if (this.loadError || this.imageBusy) return;
      const account = this.accounts.find(item => item.id === accountId);
      if (!account) return;
      this.$refs.notice?.clear();
      this.editDraft = {
        id: accountId,
        app: String(account.app ?? ''), name: String(account.name ?? ''),
        originalApp: String(account.app ?? ''), originalName: String(account.name ?? ''),
      };
      this.editError = '';
    },
    updateEditName(field, value) {
      if (!this.editDraft || (field !== 'app' && field !== 'name')) return;
      this.editDraft[field] = value;
      this.editError = '';
    },
    closeNameEditor() {
      if (!this.editDraft) return;
      this.editDraft = null;
      this.editError = '';
      try { if (typeof uni.hideKeyboard === 'function') uni.hideKeyboard(); } catch (_) {}
    },
    saveAccountNames() {
      if (!this.editDraft || this.loadError) return;
      const checked = validateAccountNames(this.editDraft.app, this.editDraft.name);
      if (!checked.valid) return;
      const current = this.accounts.find(account => account.id === this.editDraft.id);
      if (!current) { this.closeNameEditor(); this.showNotice('账户已不存在', 'error'); return; }
      if (checked.app === current.app && checked.name === current.name) return;
      const updated = renameAccount(current, checked.app, checked.name);
      const next = this.accounts.map(account => account.id === current.id ? updated : account);
      if (!this.persistAccounts(next)) {
        this.editError = '保存失败，输入已保留，请重试。';
        return;
      }
      this.accounts = next;
      this.closeNameEditor();
      this.showNotice('名称已更新');
    },
    invalidateImageImport() { this.homeDisposed = true; this.imageOperation += 1; this.imageBusy = false; },
    async onImportImage() {
      if (this.imageBusy || this.loadError || this.homeDisposed) return;
      this.addSheetOpen = false;
      this.dialog = null;
      this.$refs.notice?.clear();
      this.imageBusy = true;
      const operation = ++this.imageOperation;
      const isCancelled = () => this.homeDisposed || operation !== this.imageOperation;
      try {
        const result = await scanSystemImage({
          isCancelled,
          onStage: async stage => {
            if (isCancelled()) return;
            this.imageStage = stage;
            await waitForFeedback(() => this.$nextTick());
          },
        });
        if (isCancelled() || result.cancelled) return;
        // 原生选择器期间账户可能改变；重读失败时不按空列表添加覆盖。
        this.loadAccounts();
        if (!this.loadError) this.parseQRCode(result.text);
      } catch (error) {
        if (isCancelled()) return;
        const code = error && error.message;
        const messages = {
          IMAGE_NO_QR: '没有识别到二维码。请使用清晰、完整的二维码截图，也可以尝试相机扫描。',
          IMAGE_TOO_LARGE: '图片超过 20MB。请截取二维码区域后重试。',
          IMAGE_TYPE_INVALID: '请选择图片文件。建议使用 PNG 或 JPEG 截图。',
          NATIVE_OPERATION_BUSY: '请先完成当前系统文件选择，再重新尝试。',
          ANDROID_ONLY: '当前平台暂不支持从系统相册识别，请使用相机扫描。',
        };
        console.warn('[ImageScan]', this.imageStage, /^[A-Z_]+$/.test(code || '') ? code : 'IMAGE_SCAN_FAILED');
        this.dialog = { type: 'info', title: '暂时无法识别图片', description: messages[code] || '图片读取或识别失败。请尝试 PNG/JPEG 截图，或使用相机扫描。' };
      } finally { if (!isCancelled()) this.imageBusy = false; }
    },
    showNotice(message, kind = 'success') { this.$refs.notice?.show(message, kind); },
    startClock() {
      this.stopClock();
      this.timer = setInterval(() => {
        if (this.pageVisible) this.now = Math.floor(Date.now() / 1000);
      }, 1000);
    },
    stopClock() {
      if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    },
    loadAccounts() {
      this.loading = true;
      try {
        // 先检查键是否存在，避免将读取异常误判为首次使用；读取不回写。
        const info = uni.getStorageInfoSync();
        if (!Array.isArray(info.keys)) throw new Error('STORAGE_INFO_INVALID');
        const stored = info.keys.includes('accounts') ? uni.getStorageSync('accounts') : [];
        if (!Array.isArray(stored) || stored.some(account => !account || typeof account !== 'object' || Array.isArray(account))) throw new Error('ACCOUNTS_INVALID');
        this.accounts = stored.map(account => normalizeAccount(account));
        this.loadError = '';
        this.backupSummary = readBackupSummary(this.accounts);
      } catch (_) { this.loadError = 'ACCOUNTS_READ_FAILED'; }
      this.loading = false;
    },
    openSettings() { uni.navigateTo({ url: '/pages/settings/settings' }); },
    openBackup() { uni.navigateTo({ url: '/pages/backup/backup' }); },
    openRestore() { uni.navigateTo({ url: '/pages/backup/backup?intent=restore' }); },
    onAddAccount() { if (!this.loadError && !this.imageBusy) this.addSheetOpen = true; },
    onAddAction(action) {
      this.addSheetOpen = false;
      if (action === 'scan') this.scanQRCode();
      if (action === 'image') this.onImportImage();
    },
    onAccountAction(action) {
      const account = this.menuAccount;
      this.menuAccountId = null;
      if (!account) return;
      if (action === 'edit') this.openNameEditor(account.id);
      if (action === 'pin') this.onTogglePin(account.id);
      if (action === 'delete') this.onDeleteAccount(account.id);
    },
    onSearchInput(event) {
      this.keyword = event.detail.value;
    },
    onDeleteAccount(accountId) {
      this.$refs.notice?.clear();
      const account = this.accounts.find(item => item.id === accountId);
      if (!account) {
        return;
      }

      this.dialog = { type: 'delete', title: '删除这个账户？', id: accountId, service: account.app, name: account.name };
    },
    onDialogConfirm() {
      const pending = this.dialog;
      this.dialog = null;
      if (!pending || pending.type !== 'delete' || this.loadError) return;
      if (!this.accounts.some(account => account.id === pending.id)) return;
      const next = this.accounts.filter(account => account.id !== pending.id);
      if (!this.persistAccounts(next)) {
        this.showNotice('保存失败，删除未生效', 'error');
        return;
      }
      this.accounts = next;
      this.showNotice('账户已删除');
    },
    onTogglePin(accountId) {
      const next = this.accounts.map(account =>
        account.id === accountId
          ? { ...account, pinned: !account.pinned }
          : account
      );
      if (!this.persistAccounts(next)) {
        this.showNotice('保存失败，置顶未生效', 'error');
        return;
      }
      this.accounts = next;
    },
    scanQRCode() {
      if (this.imageBusy) return;
      uni.scanCode({
        success: (res) => {
          this.parseQRCode(res.result);
        },
        fail: (err) => {
          if (/cancel/i.test(err && err.errMsg || '')) return;
          this.dialog = { type: 'info', title: '暂时无法扫描', description: '请确认已允许相机权限，再重新尝试扫描。' };
        }
      });
    },
    parseQRCode(data) {
      let parsed;
      try {
        parsed = parseOtpAuthUri(data);
      } catch (error) {
        this.dialog = { type: 'info', title: '暂时无法添加', description: '请扫描网站提供的 TOTP 验证二维码。支持 SHA-1、SHA-256、SHA-512，6 或 8 位验证码，30 或 60 秒周期；暂不支持 HOTP。' };
        return;
      }

      this.addAccount({
        id: Date.now(),
        icon: '/static/logo.png',
        app: parsed.issuer || parsed.accountName,
        name: parsed.accountName,
        issuer: parsed.issuer,
        accountName: parsed.accountName,
        secret: parsed.secret,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        pinned: false,
        sortOrder: Date.now(),
        code: '',
        countdown: 30,
      });
    },
    addAccount(account) {
      const next = [...this.accounts, account];
      if (!this.persistAccounts(next)) {
        this.showNotice('保存失败，未添加账户', 'error');
        return;
      }
      this.accounts = next;
      this.showNotice('账户添加成功');
    },
    persistAccounts(nextAccounts) {
      // 同步写入并返回结果；调用方据此决定是否更新内存与提示。
      try {
        uni.setStorageSync('accounts', nextAccounts);
        return true;
      } catch (error) {
        console.error('账户数据存储失败');
        return false;
      }
    }
  },
};
</script>

<style scoped>
.home-content { padding-bottom: 110px; padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
.search-box { display: flex; align-items: center; height: 46px; padding: 0 13px; background: #fff; border: 1px solid var(--auth-line); border-radius: 14px; }
.search-input { flex: 1; min-width: 0; height: 44px; margin-left: 10px; font-size: 13px; }
.clear-search { display: flex; align-items: center; justify-content: center; width: 36px; height: 40px; margin: 0 -8px 0 0; padding: 0; background: transparent; }
.backup-notice { display: flex; align-items: center; width: 100%; min-height: 36px; margin: 12px 0 0; padding: 9px 11px; background: #f1eedc; border-radius: 11px; font-size: 11px; line-height: 1.6; text-align: left; color: #6e684a; }
.backup-notice text { flex: 1; margin: 0 7px; }
.group-heading { display: flex; align-items: center; margin: 20px 3px 10px; font-size: 12px; color: var(--auth-muted); }
.group-heading text { margin-left: 5px; }
.group-heading .group-count { flex: 1; text-align: right; font-size: 11px; color: #959c8c; }
.result-label { display: block; margin: 18px 3px 12px; font-size: 12px; color: var(--auth-muted); }
.add-account { position: fixed; z-index: 20; right: 18px; bottom: 24px; bottom: calc(24px + env(safe-area-inset-bottom)); display: flex; align-items: center; height: 50px; margin: 0; padding: 0 17px; background: var(--auth-ink); color: #fff; border-radius: 17px; box-shadow: 0 5px 14px rgba(37,40,36,.12); font-size: 14px; line-height: 1; }
.add-account text { margin-left: 7px; }
.empty-state { padding-top: 35px; text-align: center; }
.empty-illustration { display: block; width: 225px; height: 210px; margin: 0 auto 22px; }
.empty-title { display: block; font-size: 22px; line-height: 1.5; font-weight: 700; }
.empty-description { display: block; margin-top: 12px; font-size: 13px; line-height: 1.9; color: var(--auth-muted); white-space: pre-line; }
.empty-action { width: 180px; margin: 26px auto 0; }
.restore-link { display: block; margin: 15px auto 0; padding: 9px; background: transparent; color: #7c856f; font-size: 13px; line-height: 1.7; }
.image-link { display: flex; align-items: center; justify-content: center; margin-top: 12px; }.image-link text { margin-left: 7px; }
.privacy-note { display: flex; align-items: center; justify-content: center; margin-top: 38px; color: #939b88; font-size: 11px; }
.privacy-note text { margin-left: 5px; }
.search-empty { display: flex; align-items: center; flex-direction: column; padding-top: 70px; text-align: center; }
.small-title { margin-top: 22px; font-size: 18px; }
.error-state { padding-top: 65px; }
.loading-tip { padding-top: 50px; text-align: center; color: var(--auth-muted); font-size: 13px; }
.delete-identity { padding: 13px 14px; margin-bottom: 14px; background: #f0f0e8; border-radius: 13px; }
.delete-service { display: block; font-size: 14px; font-weight: 600; line-height: 1.7; overflow-wrap: anywhere; }
.delete-name { display: block; margin-top: 4px; font-size: 12px; color: var(--auth-muted); line-height: 1.7; overflow-wrap: anywhere; }
.dialog-copy { display: block; color: var(--auth-muted); font-size: 13px; line-height: 1.9; }
</style>
