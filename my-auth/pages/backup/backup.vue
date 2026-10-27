<template>
  <view class="backup-container">
    <text class="title">备份与恢复</text>

    <!-- 备份状态 -->
    <view class="section" v-if="backupStatus">
      <text class="section-title">备份状态</text>
      <view v-if="backupStatus.available">
        <text class="info">最近导出：{{ backupStatus.lastExportAt }}</text>
        <text class="info">导出账户数：{{ backupStatus.exportedCount }}</text>
        <text :class="backupStatus.changed ? 'warning' : 'info'">
          {{ backupStatus.changed ? '导出后有未备份的变更' : '账户与上次导出一致' }}
        </text>
      </view>
      <text v-else class="info">{{ backupStatus.error || '尚未创建备份' }}</text>
    </view>

    <!-- 创建备份 -->
    <view class="section">
      <text class="section-title">创建备份</text>
      <text class="desc">将当前账户加密导出为 .mabak 文件。仅本机存储，不上传任何服务器。</text>
      <input
        :value="exportPassword"
        @input="onExportPasswordInput"
        password
        placeholder="设置备份密码"
        class="input"
        :disabled="busy"
      />
      <input
        :value="exportPasswordConfirm"
        @input="onExportPasswordConfirmInput"
        password
        placeholder="再次输入密码"
        class="input"
        :disabled="busy"
      />
      <text class="warning">密码无法找回，遗忘将无法恢复备份</text>
      <button @click="onCreateBackup" :disabled="busy" class="btn primary">
        {{ busy && busyKind === 'export' ? '处理中…' : '创建备份' }}
      </button>
    </view>

    <!-- 恢复 -->
    <view class="section">
      <text class="section-title">恢复账户</text>
      <text class="desc">从 .mabak 文件恢复账户，重复账户默认跳过（保留现有）。</text>
      <button @click="onSelectFile" :disabled="busy" class="btn primary">
        {{ restoreStep === 'idle' ? '选择备份文件' : '重新选择文件' }}
      </button>
      <view v-if="restoreStep === 'fileSelected' || restoreStep === 'previewed'">
        <text class="info">已读取 {{ restoreFileBytes }} 字节</text>
        <input
          :value="restorePassword"
          @input="onRestorePasswordInput"
          password
          placeholder="输入备份密码"
          class="input"
          :disabled="busy"
        />
        <button @click="onDecryptPreview" :disabled="busy" class="btn primary">
          {{ busy && busyKind === 'decrypt' ? '解密中…' : '解密预览' }}
        </button>
      </view>
      <view v-if="restoreStep === 'previewed' && preview">
        <text class="info">新增 {{ preview.added }} 个账户，重复 {{ preview.duplicates.length }} 个（将跳过）</text>
        <button @click="onConfirmMerge" :disabled="busy" class="btn danger">
          {{ busy && busyKind === 'merge' ? '合并中…' : '确认合并' }}
        </button>
        <button @click="onCancelRestore" :disabled="busy" class="btn ghost">取消恢复</button>
      </view>
    </view>

    <!-- 状态/消息（不记录密码/账户/完整 URI） -->
    <text v-if="message" class="message" :class="messageKind">{{ message }}</text>
  </view>
</template>

<script>
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
  data() {
    return {
      busy: false,
      busyKind: '', // 'export' | 'decrypt' | 'merge'
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
  onShow() {
    // 页面重新显示时刷新备份状态（从其他 tab 切回也会触发）
    this.refreshBackupStatus();
  },
  methods: {
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

    // 创建备份
    onCreateBackup() {
      if (this.busy) return;
      // 校验密码
      if (!this.exportPassword) {
        this.setMessage('请输入备份密码', 'error');
        return;
      }
      if (this.exportPassword !== this.exportPasswordConfirm) {
        this.setMessage('两次输入的密码不一致', 'error');
        return;
      }
      // 读取现有账户
      const read = this.readExistingAccounts();
      if (!read.ok) {
        this.setMessage(read.error, 'error');
        return;
      }
      if (read.accounts.length === 0) {
        this.setMessage('没有可备份的账户', 'error');
        return;
      }

      this.busy = true;
      this.busyKind = 'export';
      this.setMessage('正在加密…', '');

      let backup;
      try {
        backup = createBackup(this.exportPassword, read.accounts, { randomBytes: getRandomBytes });
      } catch (e) {
        this.busy = false;
        this.busyKind = '';
        const code = e instanceof BackupError ? e.code : '';
        this.setMessage('加密失败' + (code ? '（' + code + '）' : '') + '，未导出', 'error');
        this.clearPasswords();
        return;
      }

      this.setMessage('加密完成，请选择保存位置…', '');
      const json = JSON.stringify(backup);
      const accountCount = read.accounts.length;

      pickFileForSave('my-auth-backup.mabak', json, (res) => {
        this.busy = false;
        this.busyKind = '';
        if (res.cancelled) {
          this.setMessage('已取消，未导出', '');
          this.clearPasswords();
          return;
        }
        if (res.error) {
          this.setMessage('写入失败：' + res.error + '（原账户不变）', 'error');
          this.clearPasswords();
          return;
        }
        if (!res.verified) {
          this.setMessage('写入后读回验证未通过，未记录导出状态', 'error');
          this.clearPasswords();
          return;
        }
        // 读回一致才更新导出状态（backup_meta）。
        // 文件已导出但状态记录失败时，两种结果分别说明。
        let metaWritten = false;
        try {
          const fingerprint = buildAccountFingerprint(read.accounts);
          uni.setStorageSync(BACKUP_META_KEY, {
            lastExportAt: new Date().toISOString(),
            exportedCount: accountCount,
            fingerprint,
          });
          metaWritten = true;
        } catch (_) {
          // backup_meta 写入失败不影响导出文件本身，仅状态记录缺失
        }
        if (metaWritten) {
          this.setMessage('导出成功，' + res.bytes + ' 字节，读回验证通过', 'ok');
          this.refreshBackupStatus();
        } else {
          this.setMessage('导出成功（' + res.bytes + ' 字节），但状态记录失败，备份状态不可用', 'ok');
        }
        this.clearPasswords();
      });
    },

    // 恢复：选择文件
    onSelectFile() {
      if (this.busy) return;
      // 重置恢复状态
      this.preview = null;
      this.restorePassword = '';
      this.restoreFileContent = '';
      this.restoreFileBytes = 0;
      this.setMessage('', '');

      this.busy = true;
      this.busyKind = 'export';
      pickFileForRead((res) => {
        this.busy = false;
        this.busyKind = '';
        if (res.cancelled) {
          this.setMessage('已取消选择文件', '');
          return;
        }
        if (res.error) {
          this.setMessage('读取文件失败：' + res.error + '（原账户不变）', 'error');
          return;
        }
        this.restoreFileContent = res.content;
        this.restoreFileBytes = res.bytes;
        this.restoreStep = 'fileSelected';
        this.setMessage('已读取 ' + res.bytes + ' 字节，请输入密码', '');
      });
    },

    // 恢复：解密预览（不写存储）
    onDecryptPreview() {
      if (this.busy) return;
      if (!this.restoreFileContent) {
        this.setMessage('请先选择备份文件', 'error');
        return;
      }
      if (!this.restorePassword) {
        this.setMessage('请输入备份密码', 'error');
        return;
      }

      this.busy = true;
      this.busyKind = 'decrypt';
      this.setMessage('正在解密…', '');

      let result;
      try {
        result = openBackup(this.restorePassword, this.restoreFileContent);
      } catch (e) {
        this.busy = false;
        this.busyKind = '';
        const code = e instanceof BackupError ? e.code : '';
        const friendly = code === 'PASSWORD_OR_CORRUPT'
          ? '密码错误或备份文件已损坏'
          : code === 'FORMAT_INVALID'
            ? '备份文件格式无效'
            : code === 'VERSION_UNSUPPORTED'
              ? '备份版本不支持，请升级应用'
              : '解密失败';
        this.setMessage(friendly + '（原账户不变）', 'error');
        return;
      }

      // 解密成功，预览合并结果（不写存储）
      const read = this.readExistingAccounts();
      if (!read.ok) {
        this.busy = false;
        this.busyKind = '';
        this.setMessage(read.error, 'error');
        return;
      }
      const merge = mergeAccounts(read.accounts, result.accounts);
      this.preview = {
        added: merge.added,
        duplicates: merge.duplicates,
        decryptedCount: result.accounts.length,
      };
      this.busy = false;
      this.busyKind = '';
      this.restoreStep = 'previewed';
      this.setMessage('解密成功：备份含 ' + result.accounts.length + ' 个账户，可新增 ' + merge.added + ' 个', '');
    },

    // 恢复：确认合并（写入前重新读取现有账户）
    onConfirmMerge() {
      if (this.busy) return;
      if (!this.preview) return;

      this.busy = true;
      this.busyKind = 'merge';
      this.setMessage('正在合并…', '');

      // 写入前重新读取现有账户，避免预览期间的数据变化被覆盖
      const read = this.readExistingAccounts();
      if (!read.ok) {
        this.busy = false;
        this.busyKind = '';
        this.setMessage(read.error + '（原账户不变）', 'error');
        return;
      }

      // 重新解密（文件内容仍在内存）+ 合并
      let result;
      try {
        result = openBackup(this.restorePassword, this.restoreFileContent);
      } catch (e) {
        this.busy = false;
        this.busyKind = '';
        this.setMessage('重新解密失败（原账户不变）', 'error');
        return;
      }

      // 重新分配 id：备份里的 id 可能与现有冲突（去重键是 secret 不是 id）
      const baseId = Date.now();
      const reid = result.accounts.map((acc, i) => ({ ...acc, id: baseId + i }));
      const merge = mergeAccounts(read.accounts, reid);

      // 先持久化成功再提示（复用 home 约定）
      try {
        uni.setStorageSync('accounts', merge.merged);
      } catch (e) {
        this.busy = false;
        this.busyKind = '';
        this.setMessage('写入存储失败：' + (e.message || e) + '（原账户不变）', 'error');
        this.clearPasswords();
        return;
      }
      this.busy = false;
      this.busyKind = '';
      this.setMessage('恢复完成：新增 ' + merge.added + ' 个，跳过 ' + merge.duplicates.length + ' 个重复，当前共 ' + merge.merged.length + ' 个', 'ok');
      // 重置恢复状态
      this.preview = null;
      this.restoreStep = 'idle';
      this.restoreFileContent = '';
      this.restoreFileBytes = 0;
      this.clearPasswords();
      // 恢复后账户变更，刷新备份状态（指纹会变化，显示"有变更"）
      this.refreshBackupStatus();
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
.backup-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background-color: #f8f8f8;
  height: 100%;
}
.title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 16px;
}
.section {
  background-color: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.section-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
  display: block;
}
.desc {
  font-size: 12px;
  color: #666;
  margin-bottom: 12px;
  line-height: 1.6;
  display: block;
}
.warning {
  font-size: 12px;
  color: #d93025;
  margin-bottom: 12px;
  display: block;
}
.input {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  background-color: #f0f0f5;
  font-size: 14px;
  margin-bottom: 10px;
}
.btn {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 8px;
  font-size: 15px;
  border: none;
}
.btn.primary {
  background-color: #007aff;
  color: white;
}
.btn.danger {
  background-color: #fff;
  color: #d93025;
  border: 1px solid #d93025;
}
.btn.ghost {
  background-color: #fff;
  color: #007aff;
  border: 1px solid #007aff;
}
.info {
  font-size: 13px;
  color: #333;
  margin-bottom: 10px;
  display: block;
}
.message {
  font-size: 13px;
  padding: 12px;
  border-radius: 8px;
  line-height: 1.6;
}
.message.ok {
  background-color: #e8f5e9;
  color: #2e7d32;
}
.message.error {
  background-color: #ffebee;
  color: #c62828;
}
</style>
