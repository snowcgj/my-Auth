import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import CryptoJS from 'crypto-js';
import { createBackup, openBackup, BackupError } from '../utils/backup-crypto.js';
import { generateTOTP } from '../utils/totp-core.js';
import { parseOtpAuthUri } from '../utils/otpauth.js';
import { normalizeAccount } from '../utils/account.js';
import { mergeAccounts } from '../utils/backup-merge.js';

const PUBLIC_TEST_SECRET = 'JBSWY3DPEHPK3PXP';
const PASSWORD = 'correct-horse-battery-staple';

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

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('round-trip returns the original accounts', () => {
  const accounts = [
    sampleAccount({ id: 1, secret: 'AAAA', issuer: 'Acme' }),
    sampleAccount({ id: 2, secret: 'BBBB', issuer: 'Beta', digits: 8, period: 60 }),
  ];
  const backup = createBackup(PASSWORD, accounts);
  const result = openBackup(PASSWORD, backup);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.accounts[0].secret, 'AAAA');
  assert.equal(result.accounts[0].issuer, 'Acme');
  assert.equal(result.accounts[1].secret, 'BBBB');
  assert.equal(result.accounts[1].digits, 8);
  assert.equal(result.accounts[1].period, 60);
});

test('round-trip strips runtime fields code and countdown', () => {
  const accounts = [sampleAccount({ code: '123 456', countdown: 5 })];
  const backup = createBackup(PASSWORD, accounts);
  const result = openBackup(PASSWORD, backup);
  assert.equal('code' in result.accounts[0], false);
  assert.equal('countdown' in result.accounts[0], false);
});

test('SHA2 URI accounts keep configuration and codes through storage and encrypted restore', () => {
  const timestampSeconds = 1111111109;
  const accounts = ['SHA256', 'SHA512'].map((algorithm, index) => {
    const parsed = parseOtpAuthUri(`otpauth://totp/Demo:alice?secret=${PUBLIC_TEST_SECRET}&algorithm=${algorithm}&digits=8&period=60`);
    return normalizeAccount(sampleAccount({ ...parsed, id: index + 1 }));
  });
  // 模拟持久化后重读；时间固定，不读取设备时间。
  const stored = JSON.parse(JSON.stringify(accounts)).map(normalizeAccount);
  const expectedCodes = accounts.map(account => generateTOTP({ ...account, timestampSeconds }));
  const backup = createBackup(PASSWORD, stored);
  const restored = openBackup(PASSWORD, JSON.stringify(backup)).accounts.map(normalizeAccount);
  assert.deepEqual(restored.map(account => account.algorithm), ['SHA256', 'SHA512']);
  assert.deepEqual(restored.map(account => [account.digits, account.period]), [[8, 60], [8, 60]]);
  assert.deepEqual(restored.map(account => generateTOTP({ ...account, timestampSeconds })), expectedCodes);
  const result = mergeAccounts([sampleAccount()], restored);
  assert.equal(result.added, 2, 'same secret with distinct algorithms must survive restore');
  assert.equal(mergeAccounts(result.merged, restored).added, 0, 'restoring identical configurations again skips them');
});

test('wrong password is rejected with PASSWORD_OR_CORRUPT and no partial data', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  assert.throws(
    () => openBackup('wrong-password', backup),
    (err) => err instanceof BackupError && err.code === 'PASSWORD_OR_CORRUPT',
  );
});

test('tampered ciphertext is rejected', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = clone(backup);
  // 改 base64 末字符：合法 base64 末位为 A..Z a..z 0..9 + /，改一个不同字符
  tampered.ciphertext = tampered.ciphertext.slice(0, -1) +
    (tampered.ciphertext.slice(-1) === 'A' ? 'B' : 'A');
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'PASSWORD_OR_CORRUPT',
  );
});

test('tampered mac is rejected', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = clone(backup);
  tampered.mac.value = tampered.mac.value.slice(0, -1) +
    (tampered.mac.value.slice(-1) === 'a' ? 'b' : 'a');
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'PASSWORD_OR_CORRUPT',
  );
});

test('tampered iv is rejected', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = clone(backup);
  tampered.cipher.iv = tampered.cipher.iv.slice(0, -1) +
    (tampered.cipher.iv.slice(-1) === 'a' ? 'b' : 'a');
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'PASSWORD_OR_CORRUPT',
  );
});

test('tampered salt is rejected', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = clone(backup);
  tampered.kdf.salt = tampered.kdf.salt.slice(0, -1) +
    (tampered.kdf.salt.slice(-1) === 'a' ? 'b' : 'a');
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'PASSWORD_OR_CORRUPT',
  );
});

test('tampered iterations is rejected with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = clone(backup);
  tampered.kdf.iterations = 99999;
  // V1 只接受 100000；99999 在派生前被 assertIterations 拒绝（FORMAT_INVALID），
  // 不再像旧逻辑那样继续派生后 MAC 失败（PASSWORD_OR_CORRUPT）
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('unsupported version is rejected with VERSION_UNSUPPORTED', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const future = clone(backup);
  future.version = 99;
  assert.throws(
    () => openBackup(PASSWORD, future),
    (err) => err instanceof BackupError && err.code === 'VERSION_UNSUPPORTED',
  );
});

test('invalid format identifier is rejected', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const wrong = clone(backup);
  wrong.format = 'something-else';
  assert.throws(
    () => openBackup(PASSWORD, wrong),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('corrupted JSON string is rejected with FORMAT_INVALID', () => {
  assert.throws(
    () => openBackup(PASSWORD, 'not json {{{'),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('createBackup rejects empty accounts with EMPTY_BACKUP', () => {
  assert.throws(
    () => createBackup(PASSWORD, []),
    (err) => err instanceof BackupError && err.code === 'EMPTY_BACKUP',
  );
  assert.throws(
    () => createBackup(PASSWORD, undefined),
    (err) => err instanceof BackupError && err.code === 'EMPTY_BACKUP',
  );
});

test('meta contains exportedAt and accountCount', () => {
  const accounts = [sampleAccount({ secret: 'AAAA' }), sampleAccount({ secret: 'BBBB', id: 2 })];
  const backup = createBackup(PASSWORD, accounts);
  assert.equal(typeof backup.meta.exportedAt, 'string');
  assert.ok(Number.isFinite(Date.parse(backup.meta.exportedAt)));
  assert.equal(backup.meta.accountCount, 2);
  // openBackup 回传 meta
  const result = openBackup(PASSWORD, backup);
  assert.equal(result.meta.accountCount, 2);
});

test('two backups of the same data differ due to random salt/iv', () => {
  const accounts = [sampleAccount()];
  const a = createBackup(PASSWORD, accounts);
  const b = createBackup(PASSWORD, accounts);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(a.mac.value, b.mac.value);
});

test('openBackup accepts a JSON string', () => {
  const accounts = [sampleAccount({ secret: 'AAAA' })];
  const backup = createBackup(PASSWORD, accounts);
  const json = JSON.stringify(backup);
  const result = openBackup(PASSWORD, json);
  assert.equal(result.accounts[0].secret, 'AAAA');
});

// Node 原生 crypto 独立对照：证明对 crypto-js 的调用方式与标准实现一致，
// 排除"自洽但误用 API"（例如 key 派生方式、字符串密钥再派生、IV 误用）。
test('ciphertext decrypts and mac matches using Node crypto independently', () => {
  const accounts = [sampleAccount({ secret: 'AAAA' }), sampleAccount({ secret: 'BBBB', id: 2 })];
  const backup = createBackup(PASSWORD, accounts);

  const salt = Buffer.from(backup.kdf.salt, 'hex');
  const iv = Buffer.from(backup.cipher.iv, 'hex');
  const ciphertext = Buffer.from(backup.ciphertext, 'base64');

  // 用 Node crypto 走同样的 PBKDF2-SHA256 派生 64 字节，拆 encKey/macKey
  const derived = crypto.pbkdf2Sync(PASSWORD, salt, backup.kdf.iterations, 64, 'sha256');
  const encKey = derived.subarray(0, 32);
  const macKey = derived.subarray(32, 64);

  // 独立解密
  const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  const recovered = JSON.parse(plaintext);
  assert.equal(recovered.length, 2);
  assert.equal(recovered[0].secret, 'AAAA');
  assert.equal(recovered[1].secret, 'BBBB');

  // 独立验 MAC（header 必须与 backup-crypto.buildHeader 一致）
  const header = JSON.stringify({
    format: 'my-auth-backup',
    version: 1,
    kdf: backup.kdf,
    cipher: backup.cipher,
  });
  const macInput = Buffer.concat([Buffer.from(header, 'utf8'), ciphertext]);
  const mac = crypto.createHmac('sha256', macKey).update(macInput).digest('hex');
  assert.equal(mac, backup.mac.value);
});

test('createBackup rejects with NO_SECURE_RANDOM when random source throws', () => {
  assert.throws(
    () => createBackup(PASSWORD, [sampleAccount()], {
      randomBytes: () => { throw new Error('no random source'); },
    }),
    (err) => err instanceof BackupError && err.code === 'NO_SECURE_RANDOM',
  );
});

test('createBackup rejects with NO_SECURE_RANDOM when random source returns null', () => {
  assert.throws(
    () => createBackup(PASSWORD, [sampleAccount()], {
      randomBytes: () => null,
    }),
    (err) => err instanceof BackupError && err.code === 'NO_SECURE_RANDOM',
  );
});

test('createBackup uses injected random source for salt and iv', () => {
  // 注入返回固定 WordArray 的源：若 createBackup 没用注入源，结果会不一致
  const fixedSalt = createBackup(PASSWORD, [sampleAccount()], {
    randomBytes: () => CryptoJS.enc.Hex.parse('00112233445566778899aabbccddeeff'),
  });
  const again = createBackup(PASSWORD, [sampleAccount()], {
    randomBytes: () => CryptoJS.enc.Hex.parse('00112233445566778899aabbccddeeff'),
  });
  assert.equal(fixedSalt.kdf.salt, '00112233445566778899aabbccddeeff');
  assert.equal(fixedSalt.cipher.iv, '00112233445566778899aabbccddeeff');
  assert.equal(fixedSalt.ciphertext, again.ciphertext);
});

// 参数校验回归测试：派生前拒绝异常输入，避免 DoS 或未定义行为。
// 不执行超大迭代——assertIterations 在 deriveKeys 之前调用，超大值在派生前即被拒绝。

test('createBackup rejects empty password with INVALID_PASSWORD', () => {
  assert.throws(
    () => createBackup('', [sampleAccount()]),
    (err) => err instanceof BackupError && err.code === 'INVALID_PASSWORD',
  );
});

test('createBackup rejects non-string password with INVALID_PASSWORD', () => {
  assert.throws(
    () => createBackup(null, [sampleAccount()]),
    (err) => err instanceof BackupError && err.code === 'INVALID_PASSWORD',
  );
  assert.throws(
    () => createBackup(12345, [sampleAccount()]),
    (err) => err instanceof BackupError && err.code === 'INVALID_PASSWORD',
  );
  assert.throws(
    () => createBackup(undefined, [sampleAccount()]),
    (err) => err instanceof BackupError && err.code === 'INVALID_PASSWORD',
  );
});

test('openBackup rejects empty password with INVALID_PASSWORD', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  assert.throws(
    () => openBackup('', backup),
    (err) => err instanceof BackupError && err.code === 'INVALID_PASSWORD',
  );
});

test('openBackup rejects non-string password with INVALID_PASSWORD', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  assert.throws(
    () => openBackup(null, backup),
    (err) => err instanceof BackupError && err.code === 'INVALID_PASSWORD',
  );
});

test('openBackup rejects iterations != 100000 with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  // V1 只接受 100000；篡改为 99999 应被拒绝
  const tampered = {
    ...backup,
    kdf: { ...backup.kdf, iterations: 99999 },
  };
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('openBackup rejects oversized iterations with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = {
    ...backup,
    kdf: { ...backup.kdf, iterations: 100000001 },
  };
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('openBackup does not call PBKDF2 when iterations is rejected', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = { ...backup, kdf: { ...backup.kdf, iterations: 99999 } };

  // spy：拦截 CryptoJS.PBKDF2，确认异常 iterations 在派生前被拒绝，不执行 PBKDF2
  const originalPbkdf2 = CryptoJS.PBKDF2;
  let pbkdf2Called = false;
  CryptoJS.PBKDF2 = function (...args) {
    pbkdf2Called = true;
    return originalPbkdf2.apply(CryptoJS, args);
  };

  try {
    assert.throws(
      () => openBackup(PASSWORD, tampered),
      (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
    );
    assert.equal(pbkdf2Called, false, 'PBKDF2 must not be called when iterations is rejected');
  } finally {
    CryptoJS.PBKDF2 = originalPbkdf2;
  }
});

test('openBackup rejects non-integer iterations with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = {
    ...backup,
    kdf: { ...backup.kdf, iterations: 1.5 },
  };
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('openBackup rejects non-numeric iterations with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  const tampered = {
    ...backup,
    kdf: { ...backup.kdf, iterations: 'abc' },
  };
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('openBackup rejects salt with wrong byte count with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  // salt 应为 16 字节（32 hex），改为 2 字节
  const tampered = {
    ...backup,
    kdf: { ...backup.kdf, salt: 'aabb' },
  };
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});

test('openBackup rejects iv with wrong byte count with FORMAT_INVALID', () => {
  const backup = createBackup(PASSWORD, [sampleAccount()]);
  // iv 应为 16 字节（32 hex），改为 4 字节
  const tampered = {
    ...backup,
    cipher: { ...backup.cipher, iv: '00112233' },
  };
  assert.throws(
    () => openBackup(PASSWORD, tampered),
    (err) => err instanceof BackupError && err.code === 'FORMAT_INVALID',
  );
});
