import test from 'node:test';
import assert from 'node:assert/strict';
import { readBackupSummary } from '../utils/backup-summary.js';
import { buildAccountFingerprint } from '../utils/backup-merge.js';
import { normalizeAccount, renameAccount } from '../utils/account.js';

const account = { id: 1, secret: 'JBSWY3DPEHPK3PXP', issuer: 'Acme', accountName: 'alice' };

function storage(meta) {
  const values = { accounts: [account], ...(meta ? { backup_meta: meta } : {}) };
  globalThis.uni = {
    getStorageInfoSync: () => ({ keys: Object.keys(values) }),
    getStorageSync: key => values[key],
    setStorageSync: () => { throw new Error('SUMMARY_MUST_NEVER_WRITE'); },
  };
  return values;
}
const meta = fingerprint => ({ lastExportAt: '2026-10-27T00:00:00.000Z', exportedCount: 1, fingerprint });

test('display-name edits mark backup changed until a verified export records a new fingerprint', () => {
  const values = storage(meta(buildAccountFingerprint([account])));
  assert.equal(readBackupSummary([normalizeAccount(account)]).state, 'current');
  const edited = renameAccount(normalizeAccount(account), '工作邮箱', '工作账号');
  values.accounts = [edited];
  assert.equal(readBackupSummary().state, 'changed');
  values.backup_meta = meta(buildAccountFingerprint([edited]));
  assert.equal(readBackupSummary().state, 'current');
});

test('legacy backup metadata is not overwritten or presented as proof names are backed up', () => {
  const original = meta('n1:oldhash');
  const values = storage(original);
  const result = readBackupSummary();
  assert.equal(result.state, 'legacy');
  assert.equal(result.title, '建议重新备份一次');
  assert.equal(values.backup_meta, original);
});

test('missing, corrupt and unreadable metadata stay distinguishable', () => {
  storage();
  assert.equal(readBackupSummary().state, 'never');
  storage(meta('unrecognized'));
  assert.equal(readBackupSummary().state, 'unavailable');
  storage({ ...meta('empty'), lastExportAt: 'not-a-date' });
  assert.equal(readBackupSummary().state, 'unavailable');
  uni.getStorageSync = () => { throw new Error('SIMULATED_READ'); };
  assert.equal(readBackupSummary().state, 'unavailable');
});
