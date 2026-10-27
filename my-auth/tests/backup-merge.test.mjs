import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeForBackup,
  buildDuplicateKey,
  buildAccountFingerprint,
  mergeAccounts,
  getBackupChangeState,
} from '../utils/backup-merge.js';
import { normalizeAccount, renameAccount } from '../utils/account.js';

const PUBLIC_TEST_SECRET = 'JBSWY3DPEHPK3PXP';

function sampleAccount(overrides = {}) {
  return {
    id: 1,
    icon: '/static/logo.png',
    app: 'Acme',
    name: 'alice@example.com',
    issuer: 'Acme',
    accountName: 'alice@example.com',
    secret: PUBLIC_TEST_SECRET,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    pinned: false,
    sortOrder: 1,
    code: '123 456',
    countdown: 20,
    ...overrides,
  };
}

test('serializeForBackup strips runtime fields and keeps the rest', () => {
  const out = serializeForBackup([sampleAccount()]);
  assert.equal(out.length, 1);
  assert.equal('code' in out[0], false);
  assert.equal('countdown' in out[0], false);
  assert.equal(out[0].secret, PUBLIC_TEST_SECRET);
  assert.equal(out[0].issuer, 'Acme');
  assert.equal(out[0].pinned, false);
});

test('serializeForBackup does not mutate the source', () => {
  const src = [sampleAccount()];
  serializeForBackup(src);
  assert.equal('code' in src[0], true);
  assert.equal('countdown' in src[0], true);
  assert.equal(src[0].code, '123 456');
});

test('serializeForBackup tolerates non-array and empty input', () => {
  assert.deepEqual(serializeForBackup(undefined), []);
  assert.deepEqual(serializeForBackup(null), []);
  assert.deepEqual(serializeForBackup([]), []);
});

test('buildDuplicateKey lowercases the secret', () => {
  assert.equal(buildDuplicateKey({ secret: 'JBSWY3DPEHPK3PXP' }), 'jbswy3dpehpk3pxp');
  assert.equal(buildDuplicateKey({ secret: 'jbswy3dpehpk3pxp' }), 'jbswy3dpehpk3pxp');
  assert.equal(buildDuplicateKey({ secret: 'JbsWY3dpehpk3pxp' }), 'jbswy3dpehpk3pxp');
});

test('buildDuplicateKey handles missing secret gracefully', () => {
  assert.equal(buildDuplicateKey({}), '');
  assert.equal(buildDuplicateKey(null), '');
  assert.equal(buildDuplicateKey(undefined), '');
});

test('buildAccountFingerprint is empty for no accounts', () => {
  assert.equal(buildAccountFingerprint([]), 'empty');
  assert.equal(buildAccountFingerprint(undefined), 'empty');
});

test('buildAccountFingerprint is order-independent', () => {
  const a = [sampleAccount({ secret: 'AAAA', id: 1 }), sampleAccount({ secret: 'BBBB', id: 2 })];
  const b = [sampleAccount({ secret: 'BBBB', id: 2 }), sampleAccount({ secret: 'AAAA', id: 1 })];
  assert.equal(buildAccountFingerprint(a), buildAccountFingerprint(b));
});

test('buildAccountFingerprint changes when accounts change', () => {
  const base = [sampleAccount({ secret: 'AAAA' })];
  const added = [sampleAccount({ secret: 'AAAA' }), sampleAccount({ secret: 'BBBB' })];
  const changed = [sampleAccount({ secret: 'CCCC' })];
  assert.notEqual(buildAccountFingerprint(base), buildAccountFingerprint(added));
  assert.notEqual(buildAccountFingerprint(base), buildAccountFingerprint(changed));
});

test('buildAccountFingerprint ignores runtime fields', () => {
  const withRuntime = [sampleAccount({ code: '111 111', countdown: 5 })];
  const otherRuntime = [sampleAccount({ code: '222 222', countdown: 25 })];
  assert.equal(buildAccountFingerprint(withRuntime), buildAccountFingerprint(otherRuntime));
});

test('mergeAccounts merges empty inputs into nothing', () => {
  const result = mergeAccounts([], []);
  assert.deepEqual(result.merged, []);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates.length, 0);
});

test('mergeAccounts adds all when existing is empty', () => {
  const incoming = [sampleAccount({ secret: 'AAAA', id: 1 }), sampleAccount({ secret: 'BBBB', id: 2 })];
  const result = mergeAccounts([], incoming);
  assert.equal(result.merged.length, 2);
  assert.equal(result.added, 2);
  assert.equal(result.duplicates.length, 0);
});

test('mergeAccounts skips duplicates and keeps existing pinned/sortOrder', () => {
  const existing = [sampleAccount({ secret: 'AAAA', pinned: true, sortOrder: 99, id: 1 })];
  const incoming = [sampleAccount({ secret: 'AAAA', pinned: false, sortOrder: 1, id: 2 })];
  const result = mergeAccounts(existing, incoming);
  assert.equal(result.merged.length, 1);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].reason, 'duplicate-totp');
  // 保留现有的自定义，不被 incoming 覆盖
  assert.equal(result.merged[0].pinned, true);
  assert.equal(result.merged[0].sortOrder, 99);
  assert.equal(result.merged[0].id, 1);
});

test('mergeAccounts handles a mix of new and duplicate', () => {
  const existing = [sampleAccount({ secret: 'AAAA', id: 1 })];
  const incoming = [
    sampleAccount({ secret: 'AAAA', id: 2 }), // duplicate
    sampleAccount({ secret: 'CCCC', id: 3 }), // new
  ];
  const result = mergeAccounts(existing, incoming);
  assert.equal(result.merged.length, 2);
  assert.equal(result.added, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].incoming.secret, 'AAAA');
});

test('mergeAccounts treats mixed-case secrets as the same account', () => {
  const existing = [sampleAccount({ secret: 'JBSWY3DPEHPK3PXP', id: 1 })];
  const incoming = [sampleAccount({ secret: 'jbswy3dpehpk3pxp', id: 2 })];
  const result = mergeAccounts(existing, incoming);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates.length, 1);
});

test('mergeAccounts deduplicates within incoming itself', () => {
  const incoming = [
    sampleAccount({ secret: 'AAAA', id: 1 }),
    sampleAccount({ secret: 'AAAA', id: 2 }), // duplicate of the first incoming
    sampleAccount({ secret: 'BBBB', id: 3 }),
  ];
  const result = mergeAccounts([], incoming);
  assert.equal(result.merged.length, 2);
  assert.equal(result.added, 2);
  assert.equal(result.duplicates.length, 1);
});

test('mergeAccounts tolerates non-array inputs', () => {
  const result = mergeAccounts(undefined, null);
  assert.deepEqual(result.merged, []);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates.length, 0);
});

test('same secret with different OTP configuration is not skipped', () => {
  const existing = [sampleAccount()];
  const incoming = [
    sampleAccount({ id: 2, algorithm: 'SHA256' }),
    sampleAccount({ id: 3, algorithm: 'SHA512' }),
    sampleAccount({ id: 4, digits: 8 }),
    sampleAccount({ id: 5, period: 60 }),
    sampleAccount({ id: 6, algorithm: ' sha256 ' }),
  ];
  const result = mergeAccounts(existing, incoming);
  assert.equal(result.added, 4);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.merged.length, 5);
});

test('legacy defaults still match explicit defaults without mutating accounts', () => {
  const legacy = { id: 1, secret: PUBLIC_TEST_SECRET };
  assert.equal(buildDuplicateKey(legacy), buildDuplicateKey(sampleAccount()));
  assert.equal(mergeAccounts([legacy], [sampleAccount()]).added, 0);
  assert.equal('algorithm' in legacy, false);
  for (const algorithm of ['SHA256', 'SHA512']) {
    assert.equal(mergeAccounts([sampleAccount({ algorithm })], [sampleAccount({ algorithm })]).added, 0);
  }
});

test('fingerprint uses effective display names and detects OTP configuration changes', () => {
  const base = [sampleAccount()];
  assert.equal(buildAccountFingerprint(base), buildAccountFingerprint([{ secret: PUBLIC_TEST_SECRET, issuer: 'Acme', accountName: 'alice@example.com' }]));
  for (const overrides of [{ algorithm: 'SHA256' }, { algorithm: 'SHA512' }, { digits: 8 }, { period: 60 }]) {
    assert.notEqual(buildAccountFingerprint(base), buildAccountFingerprint([sampleAccount(overrides)]));
  }
});

test('v2 fingerprint detects either display name while duplicate identity stays unchanged', () => {
  const original = sampleAccount();
  const fingerprint = buildAccountFingerprint([original]);
  assert.match(fingerprint, /^v2:/);
  for (const renamed of [renameAccount(original, '工作邮箱', original.name), renameAccount(original, original.app, '其他账号')]) {
    assert.notEqual(buildAccountFingerprint([renamed]), fingerprint);
    assert.equal(buildDuplicateKey(renamed), buildDuplicateKey(original));
    assert.equal(getBackupChangeState([renamed], fingerprint), 'changed');
  }
});

test('fingerprint is consistent across legacy storage normalization and label pairing', () => {
  const legacy = [{ id: 1, secret: PUBLIC_TEST_SECRET, issuer: 'Acme', name: 'alice' }];
  assert.equal(buildAccountFingerprint(legacy), buildAccountFingerprint(legacy.map(normalizeAccount)));
  const first = [sampleAccount({ secret: 'AAAA', name: 'alice' }), sampleAccount({ secret: 'BBBB', name: 'bob' })];
  const swapped = [sampleAccount({ secret: 'AAAA', name: 'bob' }), sampleAccount({ secret: 'BBBB', name: 'alice' })];
  assert.notEqual(buildAccountFingerprint(first), buildAccountFingerprint(swapped));
  assert.equal(buildAccountFingerprint(first), buildAccountFingerprint(first.map(account => ({ ...account, pinned: true, sortOrder: 999, code: '000000', countdown: 1 }))));
});

test('old fingerprint requests a new backup and new fingerprint follows edits', () => {
  const accounts = [sampleAccount()];
  assert.equal(getBackupChangeState(accounts, 'n1:oldhash'), 'legacy');
  assert.equal(getBackupChangeState(accounts, buildAccountFingerprint(accounts)), 'current');
  assert.equal(getBackupChangeState([], 'empty'), 'current');
  assert.equal(getBackupChangeState(accounts, 'empty'), 'changed');
  assert.equal(getBackupChangeState(accounts, 'bad-record'), 'unavailable');
});

test('restoring old labels skips duplicates and preserves current edited labels', () => {
  const before = sampleAccount();
  const edited = renameAccount(before, '工作邮箱', '已编辑的账号');
  const result = mergeAccounts([edited], [before]);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates.length, 1);
  assert.deepEqual(result.merged, [edited]);
});
