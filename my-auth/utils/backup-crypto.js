// 加密备份的密码学层：AES-256-CBC + PBKDF2-HMAC-SHA256 + HMAC-SHA256（Encrypt-then-MAC）。
// 依赖 crypto-js（已装，纯 JS，三端可用）。不依赖 uni.*、Node Buffer/crypto、plus.android。
// 设计见 .ai/plans/2026-10-26-encrypted-backup.md。
//
// 架构（依赖注入）：createBackup 接受 options.randomBytes（返回 crypto-js WordArray）。
// - 核心模块不散落平台 API；Android SecureRandom 由适配层 platform-random.js 注入。
// - 默认 randomBytes 用 Web Crypto（globalThis.crypto/window.crypto），不可用抛 NO_SECURE_RANDOM。
// - 安全随机源不可用时明确报错并禁止导出（不降级 Math.random）。
//
// 关键正确性点：
// - PBKDF2 显式 iterations（crypto-js 默认 1），hasher 用 SHA256。
// - AES 传 WordArray 密钥而非字符串，避免 OpenSSL 再派生。
// - 派生 512 bit 拆 encKey(256) + macKey(256)。
// - MAC 覆盖 header + ciphertext，恒定时间比较。
// - 不打印随机字节、密钥、密码或备份内容。

import CryptoJS from 'crypto-js';
import { serializeForBackup } from './backup-merge.js';

const FORMAT = 'my-auth-backup';
const VERSION = 1;
const ITERATIONS = 100000;
const SALT_BYTES = 16;
const IV_BYTES = 16;
const PBKDF2_KEY_SIZE_WORDS = 16;
const ENC_KEY_WORDS = 8;
const MAC_KEY_WORDS = 8;

export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

// 字节数组（Uint8Array 或 Array）→ crypto-js WordArray
function bytesToWordArray(bytes, nBytes) {
  const words = [];
  for (let i = 0; i < nBytes; i++) {
    words[i >>> 2] = words[i >>> 2] || 0;
    words[i >>> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, nBytes);
}

// 默认安全随机源：Web Crypto。H5/小程序/Node 有 globalThis.crypto；部分 App 也有。
// 不可用返回 null（由 createBackup 决定是否抛错）。
function defaultRandomBytes(nBytes) {
  const cryptoObj =
    (typeof globalThis !== 'undefined' && globalThis.crypto) ||
    (typeof window !== 'undefined' && window.crypto);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const u8 = new Uint8Array(nBytes);
    cryptoObj.getRandomValues(u8);
    return bytesToWordArray(u8, nBytes);
  }
  return null;
}

function constantTimeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function buildHeader(kdf, cipher) {
  return JSON.stringify({ format: FORMAT, version: VERSION, kdf, cipher });
}

function deriveKeys(password, saltWordArray, iterations) {
  const derived = CryptoJS.PBKDF2(password, saltWordArray, {
    keySize: PBKDF2_KEY_SIZE_WORDS,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  const encKey = CryptoJS.lib.WordArray.create(
    derived.words.slice(0, ENC_KEY_WORDS),
    ENC_KEY_WORDS * 4,
  );
  const macKey = CryptoJS.lib.WordArray.create(
    derived.words.slice(ENC_KEY_WORDS, PBKDF2_KEY_SIZE_WORDS),
    MAC_KEY_WORDS * 4,
  );
  return { encKey, macKey };
}

// 解析注入的 randomBytes 结果（WordArray 或 null/抛错），统一转成 WordArray 或抛 NO_SECURE_RANDOM。
function resolveRandom(source, nBytes) {
  if (typeof source !== 'function') {
    throw new BackupError('NO_SECURE_RANDOM', '安全随机源不可用，禁止导出');
  }
  let result;
  try {
    result = source(nBytes);
  } catch (e) {
    throw new BackupError('NO_SECURE_RANDOM', '安全随机源调用失败，禁止导出');
  }
  if (!result) {
    throw new BackupError('NO_SECURE_RANDOM', '安全随机源不可用，禁止导出');
  }
  return result;
}

// 创建加密备份。返回备份对象（调用方 JSON.stringify 后写文件）。
// options.randomBytes: (nBytes) => WordArray，可选。不传则用默认 Web Crypto 源；
//   任意源不可用都抛 NO_SECURE_RANDOM 并禁止导出（不降级）。
export function createBackup(password, accounts, options = {}) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new BackupError('EMPTY_BACKUP', '没有可备份的账户');
  }

  const randomSource = options.randomBytes || defaultRandomBytes;

  const clean = serializeForBackup(accounts);
  const plaintext = JSON.stringify(clean);

  const salt = resolveRandom(randomSource, SALT_BYTES);
  const iv = resolveRandom(randomSource, IV_BYTES);
  const { encKey, macKey } = deriveKeys(password, salt, ITERATIONS);

  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plaintext), encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ciphertext = encrypted.ciphertext;

  const kdf = {
    alg: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: salt.toString(CryptoJS.enc.Hex),
  };
  const cipher = {
    alg: 'AES-256-CBC',
    iv: iv.toString(CryptoJS.enc.Hex),
  };
  const header = buildHeader(kdf, cipher);
  const macInput = CryptoJS.enc.Utf8.parse(header).concat(ciphertext);
  const mac = CryptoJS.HmacSHA256(macInput, macKey).toString(CryptoJS.enc.Hex);

  return {
    format: FORMAT,
    version: VERSION,
    kdf,
    cipher,
    mac: { alg: 'HMAC-SHA256', value: mac },
    ciphertext: ciphertext.toString(CryptoJS.enc.Base64),
    meta: {
      exportedAt: new Date().toISOString(),
      accountCount: clean.length,
    },
  };
}

// 打开加密备份。password 错误、文件损坏或版本不支持时抛 BackupError，绝不返回部分账户。
// backup 可传对象或 JSON 字符串。openBackup 不需要随机数。
export function openBackup(password, backup) {
  let obj;
  if (typeof backup === 'string') {
    try {
      obj = JSON.parse(backup);
    } catch {
      throw new BackupError('FORMAT_INVALID', '备份文件不是有效的 JSON');
    }
  } else if (backup && typeof backup === 'object') {
    obj = backup;
  } else {
    throw new BackupError('FORMAT_INVALID', '备份文件格式无效');
  }

  if (obj.format !== FORMAT) {
    throw new BackupError('FORMAT_INVALID', '不是 my-auth 备份文件');
  }
  if (obj.version !== VERSION) {
    throw new BackupError('VERSION_UNSUPPORTED', `备份版本 ${obj.version} 不支持，请升级应用`);
  }

  let salt, iv, ciphertext, kdf, cipher;
  try {
    salt = CryptoJS.enc.Hex.parse(obj.kdf.salt);
    iv = CryptoJS.enc.Hex.parse(obj.cipher.iv);
    ciphertext = CryptoJS.enc.Base64.parse(obj.ciphertext);
    kdf = obj.kdf;
    cipher = obj.cipher;
  } catch {
    throw new BackupError('FORMAT_INVALID', '备份文件字段缺失或损坏');
  }

  const iterations = Number(kdf.iterations);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new BackupError('FORMAT_INVALID', '迭代次数无效');
  }

  const { encKey, macKey } = deriveKeys(password, salt, iterations);

  const header = buildHeader(kdf, cipher);
  const macInput = CryptoJS.enc.Utf8.parse(header).concat(ciphertext);
  const computedMac = CryptoJS.HmacSHA256(macInput, macKey).toString(CryptoJS.enc.Hex);
  if (!constantTimeEqualHex(computedMac, obj.mac && obj.mac.value)) {
    throw new BackupError('PASSWORD_OR_CORRUPT', '密码错误或备份文件已损坏');
  }

  let plaintext;
  try {
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, encKey, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    throw new BackupError('PASSWORD_OR_CORRUPT', '解密失败，备份文件可能已损坏');
  }
  if (!plaintext) {
    throw new BackupError('PASSWORD_OR_CORRUPT', '解密结果为空，备份文件可能已损坏');
  }

  let accounts;
  try {
    accounts = JSON.parse(plaintext);
  } catch {
    throw new BackupError('PASSWORD_OR_CORRUPT', '解密后的数据不是有效的账户列表');
  }
  if (!Array.isArray(accounts)) {
    throw new BackupError('PASSWORD_OR_CORRUPT', '解密后的数据不是账户列表');
  }

  return { accounts, meta: obj.meta || {} };
}
