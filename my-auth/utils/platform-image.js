// Android 系统选图与本地识别。图片与二维码内容不写日志，不查询在线服务。
import { launchActivityForResult } from './activity-result.js';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const BUFFER_BYTES = 64 * 1024;

export function supportsSystemImageScan() {
  return typeof plus !== 'undefined' && plus.os?.name === 'Android' && !!plus.android && typeof plus.barcode?.scan === 'function';
}

function requireCount(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('IMAGE_BRIDGE_INVALID');
  return value;
}

// Java 对象在桥接两侧传递；不将图片展开为 JS 字节数组或逐字节跨桥接。
export function copyImageToCache(android, activity, uri) {
  let input = null;
  let output = null;
  let source = null;
  let target = null;
  let file = null;
  let complete = false;
  try {
    const resolver = activity.getContentResolver();
    const mime = android.invoke(resolver, 'getType', uri);
    if (typeof mime === 'string' && !mime.startsWith('image/')) throw new Error('IMAGE_TYPE_INVALID');
    input = android.invoke(resolver, 'openInputStream', uri);
    if (!input) throw new Error('IMAGE_READ_FAILED');
    file = android.invoke('java.io.File', 'createTempFile', 'auth-qr-', '.img', android.invoke(activity, 'getCacheDir'));
    if (!file) throw new Error('IMAGE_CACHE_FAILED');
    output = android.newObject('java.io.FileOutputStream', file);
    if (!output) throw new Error('IMAGE_CACHE_FAILED');
    source = android.invoke('java.nio.channels.Channels', 'newChannel', input);
    target = android.invoke(output, 'getChannel');
    const buffer = android.invoke('java.nio.ByteBuffer', 'allocate', BUFFER_BYTES);
    if (!source || !target || !buffer) throw new Error('IMAGE_BRIDGE_INVALID');
    let total = 0;
    for (;;) {
      const read = requireCount(android.invoke(source, 'read', buffer), -1, BUFFER_BYTES);
      if (read === -1) break;
      if (read === 0) throw new Error('IMAGE_COPY_STALLED');
      total += read;
      if (total > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
      android.invoke(buffer, 'flip');
      let remaining = read;
      while (remaining > 0) {
        const written = requireCount(android.invoke(target, 'write', buffer), 1, remaining);
        remaining -= written;
      }
      android.invoke(buffer, 'clear');
    }
    if (!total || requireCount(android.invoke(target, 'size'), 0, MAX_IMAGE_BYTES) !== total) throw new Error('IMAGE_COPY_INVALID');
    const path = android.invoke(file, 'getAbsolutePath');
    if (typeof path !== 'string' || !path) throw new Error('IMAGE_CACHE_FAILED');
    complete = true;
    return { file, path, bytes: total };
  } finally {
    for (const object of [target, source, output, input]) {
      if (object) { try { android.invoke(object, 'close'); } catch (_) {} }
    }
    if (!complete && file) removeTemporaryImage(android, file);
  }
}

function removeTemporaryImage(android, file) {
  try {
    if (android.invoke(file, 'delete') !== true) console.warn('[ImageScan] TEMP_CLEANUP_FAILED');
  } catch (_) { console.warn('[ImageScan] TEMP_CLEANUP_FAILED'); }
}

function makeIntent(android, photoPicker) {
  const Intent = android.importClass('android.content.Intent');
  const intent = new Intent(photoPicker ? 'android.provider.action.PICK_IMAGES' : Intent.ACTION_OPEN_DOCUMENT);
  intent.setType('image/*');
  if (!photoPicker) intent.addCategory(Intent.CATEGORY_OPENABLE);
  intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  return intent;
}

export async function scanSystemImage({ onStage = () => {}, isCancelled = () => false } = {}) {
  if (!supportsSystemImageScan()) throw new Error('ANDROID_ONLY');
  const android = plus.android;
  let temporary = null;
  try {
    await onStage('pick');
    if (isCancelled()) return { cancelled: true };
    const Version = android.importClass('android.os.Build$VERSION');
    let result;
    if (Number(Version.SDK_INT) >= 33) {
      try { result = await launchActivityForResult(makeIntent(android, true), 3001); }
      catch (error) {
        if (error.message === 'NATIVE_OPERATION_BUSY') throw error;
        result = await launchActivityForResult(makeIntent(android, false), 3001);
      }
    } else result = await launchActivityForResult(makeIntent(android, false), 3001);
    if (isCancelled() || result.resultCode !== -1) return { cancelled: true };
    if (!result.data) throw new Error('IMAGE_READ_FAILED');
    android.importClass(result.data);
    const uri = result.data.getData();
    if (!uri) throw new Error('IMAGE_READ_FAILED');
    await onStage('read');
    if (isCancelled()) return { cancelled: true };
    temporary = copyImageToCache(android, android.runtimeMainActivity(), uri);
    await onStage('recognize');
    if (isCancelled()) return { cancelled: true };
    const text = await new Promise((resolve, reject) => {
      plus.barcode.scan(temporary.path, (_type, value) => resolve(value), () => reject(new Error('IMAGE_NO_QR')), [plus.barcode.QR]);
    });
    if (isCancelled()) return { cancelled: true };
    if (typeof text !== 'string' || !text) throw new Error('IMAGE_NO_QR');
    return { text };
  } finally {
    if (temporary) removeTemporaryImage(android, temporary.file);
  }
}
