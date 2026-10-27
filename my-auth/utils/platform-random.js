// 平台适配层：安全随机数源。
// - Android（plus.android 可用）：java.security.SecureRandom via Native.js。
// - 其他（H5/小程序/Node/部分 App）：Web Crypto（globalThis.crypto/window.crypto）。
// - 任意源不可用抛 BackupError('NO_SECURE_RANDOM')，绝不降级到 Math.random。
//
// 核心模块 backup-crypto.js 通过依赖注入（options.randomBytes）接收本函数，
// 不直接 import 本文件，密码学逻辑不散落平台 API。
//
// 不打印随机字节内容（日志只用账户 ID/阶段/错误类型）。
//
// Android Native.js 写法待真机验证：byte[] 创建用 java.lang.reflect.Array.newInstance，
// 元素读取用 Array.get（java byte 为 signed -128~127，转 0-255 用 (b+256)%256）。
// 若 Native.js 桥接不可行，抛 NO_SECURE_RANDOM，由上层报告具体错误，不自动退回不明确来源。

import CryptoJS from 'crypto-js';
import { BackupError } from './backup-crypto.js';

function bytesToWordArray(bytes, nBytes) {
  const words = [];
  for (let i = 0; i < nBytes; i++) {
    words[i >>> 2] = words[i >>> 2] || 0;
    words[i >>> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, nBytes);
}

function webCryptoRandom(nBytes) {
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

function androidSecureRandom(nBytes) {
  if (typeof plus === 'undefined' || !plus.android) {
    return null;
  }
  try {
    const Byte = plus.android.importClass('java.lang.Byte');
    const byteArray = plus.android.invoke(
      'java.lang.reflect.Array',
      'newInstance',
      Byte.TYPE,
      nBytes,
    );
    const SecureRandom = plus.android.importClass('java.security.SecureRandom');
    const sr = new SecureRandom();
    sr.nextBytes(byteArray);
    const ArrayCls = plus.android.importClass('java.lang.reflect.Array');
    const arr = new Array(nBytes);
    for (let i = 0; i < nBytes; i++) {
      const b = plus.android.invoke(ArrayCls, 'get', byteArray, i);
      arr[i] = (b + 256) % 256;
    }
    return bytesToWordArray(arr, nBytes);
  } catch (e) {
    // Native.js 桥接失败：返回 null，由上层抛 NO_SECURE_RANDOM 并报告具体错误
    return null;
  }
}

export function getRandomBytes(nBytes) {
  const web = webCryptoRandom(nBytes);
  if (web) {
    return web;
  }
  const android = androidSecureRandom(nBytes);
  if (android) {
    return android;
  }
  throw new BackupError('NO_SECURE_RANDOM', '当前环境无可用安全随机源');
}
