// 展示层摘要：只读取既有存储，不迁移数据、不生成验证码、不保存密钥副本。
import { buildAccountFingerprint } from './backup-merge.js';

const unavailable = () => ({ state: 'unavailable', title: '备份状态暂不可用', detail: '进入备份与恢复查看', count: 0, exportedAt: '' });

export function readBackupSummary(accounts) {
  try {
    const keys = uni.getStorageInfoSync().keys;
    if (!Array.isArray(keys)) return unavailable();
    if (!keys.includes('backup_meta')) {
      return { state: 'never', title: '还没有创建备份', detail: '为账户留一份可恢复的副本', count: 0, exportedAt: '' };
    }
    const meta = uni.getStorageSync('backup_meta');
    if (!meta || typeof meta !== 'object' || typeof meta.lastExportAt !== 'string' || typeof meta.fingerprint !== 'string' || !Number.isInteger(meta.exportedCount) || meta.exportedCount < 0) return unavailable();
    const date = new Date(meta.lastExportAt);
    if (!Number.isFinite(date.getTime())) return unavailable();
    const current = accounts === undefined
      ? (keys.includes('accounts') ? uni.getStorageSync('accounts') : [])
      : accounts;
    if (!Array.isArray(current) || current.some(account => !account || typeof account !== 'object')) return unavailable();
    const changed = buildAccountFingerprint(current) !== meta.fingerprint;
    const pad = value => String(value).padStart(2, '0');
    const exportedAt = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return {
      state: changed ? 'changed' : 'current',
      title: changed ? '账户有更新，记得备份' : '账户与上次导出一致',
      detail: `上次导出 ${exportedAt} · ${meta.exportedCount} 个账户`,
      count: meta.exportedCount,
      exportedAt,
    };
  } catch (_) {
    return unavailable();
  }
}
