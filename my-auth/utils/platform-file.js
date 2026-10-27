// 平台适配层：文件 IO（Android SAF）。
// - 导出：ACTION_CREATE_DOCUMENT → ContentResolver.openOutputStream 写。
// - 导入：ACTION_OPEN_DOCUMENT → ContentResolver.openInputStream 读。
// 通过 ContentResolver 直接读写 content:// URI，不转文件路径，不加存储权限。
// 用户取消时 callback 标记 cancelled，不报成功、不更新状态。
//
// V2 第六轮（恢复端修复）：
// pickFileForRead 的 read(byte[]) 带数组参数在 Native.js 桥接静默失败返回 undefined，
// 导致循环不执行、total=0（真机日志确认）。改为逐字节 read() 无参读取（导出端 verify
// 已验证此法 work，667 字节逐字节比对一致），累积到 JS 数组后用 utf8Decode 解码。
// utf8Decode 优先 TextDecoder，不可用走手写 UTF-8 解码（App 原生 runtime 可能没
// TextDecoder，与 crypto-js 因 window.crypto 不可用挂掉同理）。
// 不输出内容/密钥/完整 URI。

const RESULT_OK = -1;
// 文件大小限制：导出内容上限 64KB（约 200-300 账户，个人使用足够），
// 导入文件上限 1MB（允许读取稍大文件，拒绝明显异常的大文件防耗尽内存）。
// 两者不统一为同一值：导出是写出内容（应小），导入是读入文件（允许略大但要有上限）。
const MAX_EXPORT_BYTES = 64 * 1024;
const MAX_IMPORT_BYTES = 1024 * 1024;

// 防重复操作：文件选择器是异步的，用户可在等待期间再次点击。
// operationInProgress 标志确保同一时刻只有一个 SAF 操作进行中。
let operationInProgress = false;

function beginOperation() {
  if (operationInProgress) return false;
  operationInProgress = true;
  return true;
}

function endOperation() {
  operationInProgress = false;
}

function buildIntent(action, filename) {
  const Intent = plus.android.importClass('android.content.Intent');
  const intent = new Intent(action);
  intent.addCategory(Intent.CATEGORY_OPENABLE);
  intent.setType('application/octet-stream');
  intent.setFlags(
    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
  );
  if (filename) {
    intent.putExtra(Intent.EXTRA_TITLE, filename);
  }
  return intent;
}

function utf8Bytes(text) {
  const encoded = encodeURIComponent(text);
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return bytes;
}

function javaClassName(object) {
  if (object == null) return 'null';
  try {
    const cls = plus.android.invoke(object, 'getClass');
    const name = plus.android.invoke(cls, 'getName');
    return typeof name === 'string' ? name : 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function requireReadByte(value) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < -1 ||
    value > 255
  ) {
    throw new Error('SAF_READ_BRIDGE_INVALID');
  }
  return value;
}

// UTF-8 解码：把 0-255 字节数组转回字符串。
// 优先 TextDecoder（H5/标准环境）；App 原生 runtime 可能没 TextDecoder
// （与 crypto-js 因 window.crypto 不可用挂掉同理），走手写 UTF-8 解码兜底。
// 非法序列替换为 U+FFFD，不抛错（解析容错）。
function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    try {
      const dec = new TextDecoder('utf-8');
      return dec.decode(new Uint8Array(bytes));
    } catch (_) {
      // 落到手写
    }
  }
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out.push(b1);
    } else if (b1 < 0xC0) {
      out.push(0xFFFD); // 延续字节出现在开头
    } else if (b1 < 0xE0) {
      if (i >= bytes.length) { out.push(0xFFFD); break; }
      const b2 = bytes[i++];
      if ((b2 & 0xC0) !== 0x80) { out.push(0xFFFD); continue; }
      out.push(((b1 & 0x1F) << 6) | (b2 & 0x3F));
    } else if (b1 < 0xF0) {
      if (i + 1 >= bytes.length) { out.push(0xFFFD); break; }
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      if ((b2 & 0xC0) !== 0x80 || (b3 & 0xC0) !== 0x80) { out.push(0xFFFD); continue; }
      out.push(((b1 & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F));
    } else if (b1 < 0xF8) {
      if (i + 2 >= bytes.length) { out.push(0xFFFD); break; }
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      if ((b2 & 0xC0) !== 0x80 || (b3 & 0xC0) !== 0x80 || (b4 & 0xC0) !== 0x80) { out.push(0xFFFD); continue; }
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3F) << 12) | ((b3 & 0x3F) << 6) | (b4 & 0x3F);
      // 转 UTF-16 surrogate pair
      const s = cp - 0x10000;
      out.push(0xD800 + (s >> 10));
      out.push(0xDC00 + (s & 0x3FF));
    } else {
      out.push(0xFFFD);
    }
  }
  // 分块拼接避免大数组爆栈（小备份文件无所谓，但留好习惯）
  const CHUNK = 0x8000;
  let result = '';
  for (let j = 0; j < out.length; j += CHUNK) {
    result += String.fromCharCode.apply(null, out.slice(j, j + CHUNK));
  }
  return result;
}

// 接收 Java Uri 对象，不转文件路径。
export function writeSafJsonVerified(resolver, uri, content) {
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('SAF_CONTENT_EMPTY_OR_INVALID');
  }

  const bytes = utf8Bytes(content);
  if (bytes.length === 0 || bytes.length > MAX_EXPORT_BYTES) {
    throw new Error('SAF_CONTENT_SIZE_OUT_OF_RANGE');
  }

  let output = null;
  let input = null;
  let stage = 'start';
  // 阶段切换日志：让 HBuilderX 控制台看到卡在哪一步
  const setStage = (name) => {
    stage = name;
    console.log('[SAF-stage]', name, 'bytes=', bytes.length);
  };

  console.log('[SAF-input]', JSON.stringify({
    contentType: typeof content,
    charLength: content.length,
    utf8Length: bytes.length,
  }));

  try {
    setStage('open-output');
    output = plus.android.invoke(resolver, 'openOutputStream', uri, 'w');
    if (output == null) throw new Error('SAF_OUTPUT_NULL');
    const outputClass = javaClassName(output);
    console.log('[SAF-native]', JSON.stringify({ outputClass }));

    setStage('create-buffered-output');
    const bufferedOutput = plus.android.newObject(
      'java.io.BufferedOutputStream',
      output,
    );
    if (bufferedOutput == null) {
      throw new Error('SAF_BUFFERED_OUTPUT_NULL');
    }
    output = bufferedOutput;

    setStage('write');
    for (let i = 0; i < bytes.length; i++) {
      plus.android.invoke(output, 'write', bytes[i]);
      if (i % 500 === 0) {
        console.log('[SAF-progress] write at', i, '/', bytes.length);
      }
    }

    setStage('flush');
    plus.android.invoke(output, 'flush');

    setStage('close-output');
    plus.android.invoke(output, 'close');
    output = null;

    setStage('open-input');
    input = plus.android.invoke(resolver, 'openInputStream', uri);
    if (input == null) throw new Error('SAF_INPUT_NULL');
    const inputClass = javaClassName(input);
    console.log('[SAF-native]', JSON.stringify({ inputClass }));

    setStage('create-buffered-input');
    const bufferedInput = plus.android.newObject(
      'java.io.BufferedInputStream',
      input,
    );
    if (bufferedInput == null) {
      throw new Error('SAF_BUFFERED_INPUT_NULL');
    }
    input = bufferedInput;

    setStage('verify');
    for (let i = 0; i < bytes.length; i++) {
      const actual = requireReadByte(plus.android.invoke(input, 'read'));
      if (actual === -1) {
        throw new Error('SAF_VERIFY_EARLY_EOF_AT_' + i);
      }
      if (actual !== bytes[i]) {
        throw new Error('SAF_VERIFY_MISMATCH_AT_' + i);
      }
      if (i % 500 === 0) {
        console.log('[SAF-progress] verify at', i, '/', bytes.length);
      }
    }
    const tail = requireReadByte(plus.android.invoke(input, 'read'));
    if (tail !== -1) throw new Error('SAF_VERIFY_EXTRA_BYTES');

    setStage('close-input');
    plus.android.invoke(input, 'close');
    input = null;

    setStage('verified');
    console.log('[SAF]', JSON.stringify({
      stage: 'verified',
      chars: content.length,
      expectedBytes: bytes.length,
      verifiedBytes: bytes.length,
      outputClass,
      inputClass,
    }));

    return { bytes: bytes.length, verified: true };
  } catch (error) {
    console.error('[SAF]', JSON.stringify({
      stage,
      expectedBytes: bytes.length,
    }));
    throw error;
  } finally {
    if (input != null) {
      try { plus.android.invoke(input, 'close'); } catch (_) {}
    }
    if (output != null) {
      try { plus.android.invoke(output, 'close'); } catch (_) {}
    }
  }
}

export function pickFileForSave(filename, content, callback) {
  if (!beginOperation()) {
    callback({ error: '操作进行中，请等待完成' });
    return;
  }
  const Intent = plus.android.importClass('android.content.Intent');
  const intent = buildIntent(Intent.ACTION_CREATE_DOCUMENT, filename);
  const Activity = plus.android.runtimeMainActivity();

  console.log('[SAF-callback] pickFileForSave starting');
  // 用 onActivityResult 覆盖写法：三参数带 callback 的 startActivityForResult 在本机不触发回调。
  // 参 DCloud 官方问答案例：两参数 startActivityForResult + main.onActivityResult 赋值。
  Activity.onActivityResult = function (requestCode, resultCode, data) {
    console.log('[SAF-callback] save onActivityResult triggered', 'requestCode=', requestCode, 'resultCode=', resultCode);
    if (requestCode !== 2001) return;
    if (resultCode !== RESULT_OK || !data) {
      callback({ cancelled: true });
      endOperation();
      return;
    }
    try {
      // 返回的 data 是 Java Intent，必须 importClass 后才能调 getData()
      plus.android.importClass(data);
      const uri = data.getData();
      const resolver = Activity.getContentResolver();
      const result = writeSafJsonVerified(resolver, uri, content);
      callback({
        ok: true,
        bytes: result.bytes,
        verified: result.verified,
        uri: uri.toString(),
      });
    } catch (e) {
      callback({ error: (e && e.message) || String(e) });
    }
    endOperation();
  };
  try {
    Activity.startActivityForResult(intent, 2001);
  } catch (e) {
    callback({ error: 'startActivityForResult 抛错：' + ((e && e.message) || String(e)) });
    endOperation();
  }
}

export function pickFileForRead(callback) {
  if (!beginOperation()) {
    callback({ error: '操作进行中，请等待完成' });
    return;
  }
  const Intent = plus.android.importClass('android.content.Intent');
  const intent = buildIntent(Intent.ACTION_OPEN_DOCUMENT, null);
  const Activity = plus.android.runtimeMainActivity();

  console.log('[SAF-callback] pickFileForRead starting');
  Activity.onActivityResult = function (requestCode, resultCode, data) {
    console.log('[SAF-callback] read onActivityResult triggered', 'requestCode=', requestCode, 'resultCode=', resultCode);
    if (requestCode !== 2002) return;
    if (resultCode !== RESULT_OK || !data) {
      callback({ cancelled: true });
      endOperation();
      return;
    }
    let input = null;
    let finished = false;
    try {
      plus.android.importClass(data);
      const uri = data.getData();
      const resolver = Activity.getContentResolver();
      input = plus.android.invoke(resolver, 'openInputStream', uri);
      if (input == null) throw new Error('SAF_INPUT_NULL');

      // 逐字节 read() 无参读取。
      // 原因：plus.android.invoke(input, 'read', buf)（read(byte[]) 带数组参数）
      // 在 Native.js 桥接会静默失败返回 undefined，导致循环不执行、total=0。
      // 导出端 verify 用的 read() 无参已验证 work（667 字节逐字节比对一致）。
      const bytesRead = [];
      for (;;) {
        if (bytesRead.length >= MAX_IMPORT_BYTES) {
          // 超过大小上限：立即关闭流报错，防止恶意大文件耗尽内存
          try { plus.android.invoke(input, 'close'); } catch (_) {}
          input = null;
          callback({ error: '文件过大（超过 1MB），可能不是有效的备份文件' });
          finished = true;
          break;
        }
        const b = requireReadByte(plus.android.invoke(input, 'read'));
        if (b === -1) break;
        bytesRead.push(b);
      }
      if (!finished) {
        console.log('[SAF-callback] read total=', bytesRead.length);
        plus.android.invoke(input, 'close');
        input = null;
        const content = utf8Decode(bytesRead);
        callback({ ok: true, content, uri: uri.toString(), bytes: bytesRead.length });
        finished = true;
      }
    } catch (e) {
      const msg = (e && e.message) || String(e);
      console.error('[SAF-read-error]', msg);
      try { if (input) plus.android.invoke(input, 'close'); } catch (cerr) {}
      if (!finished) {
        callback({ error: msg });
        finished = true;
      }
    }
    endOperation();
  };
  try {
    Activity.startActivityForResult(intent, 2002);
  } catch (e) {
    callback({ error: 'startActivityForResult 抛错：' + ((e && e.message) || String(e)) });
    endOperation();
  }
}
