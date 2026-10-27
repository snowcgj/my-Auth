import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityResultLauncher } from '../utils/activity-result.js';
import { copyImageToCache, scanSystemImage, supportsSystemImageScan } from '../utils/platform-image.js';
import { pickFileForSave, pickFileForRead } from '../utils/platform-file.js';

test('one activity listener routes results, forwards unknown codes and rejects concurrent launches', async () => {
  let foreign = 0;
  const host = { onActivityResult: () => foreign++, startActivityForResult() {} };
  const launch = createActivityResultLauncher(() => ({ runtimeMainActivity: () => host }));
  const first = launch({}, 2001);
  const listener = host.onActivityResult;
  await assert.rejects(launch({}, 3001), /NATIVE_OPERATION_BUSY/);
  listener(9999, -1, {});
  assert.equal(foreign, 1);
  listener(2001, 0, null);
  assert.equal((await first).resultCode, 0);
  const second = launch({}, 3001);
  assert.equal(host.onActivityResult, listener);
  listener(3001, -1, 'image');
  assert.equal((await second).data, 'image');
});

test('failed activity startup releases the shared pending request', async () => {
  let fail = true;
  const host = { startActivityForResult() { if (fail) throw new Error('START_FAILED'); } };
  const launch = createActivityResultLauncher(() => ({ runtimeMainActivity: () => host }));
  await assert.rejects(launch({}, 3001), /START_FAILED/);
  fail = false;
  const retry = launch({}, 2002);
  host.onActivityResult(2002, 0, null);
  assert.equal((await retry).resultCode, 0);
});

// 模拟 Java 对象/桥接，不代表 Android Native.js 已验证；所有内容均为测试数据。
function bridge() {
  const state = { bytes: new TextEncoder().encode('public-image-fixture'), sdk: 33, resultCode: -1, scans: 0, actions: [], autoResult: true, files: [] };
  const closeable = object => Object.assign(object, { closed: false, close() { this.closed = true; } });
  const makeInput = () => {
    const input = closeable({ position: 0, read() {
      if (state.invalidRead) return undefined;
      return this.position < state.bytes.length ? state.bytes[this.position++] : -1;
    } });
    state.lastInput = input;
    return input;
  };
  const resolver = {
    getType: () => state.mime || 'image/png',
    openInputStream: () => { if (state.openFail) throw new Error('SIMULATED_READ'); return makeInput(); },
    openOutputStream: () => closeable({
      write(byte) { if (!state.writing) { state.bytes = []; state.writing = true; } state.bytes.push(byte); },
      flush() {},
      close() { this.closed = true; state.bytes = Uint8Array.from(state.bytes); state.writing = false; },
    }),
  };
  class Intent {
    static ACTION_OPEN_DOCUMENT = 'open';
    static ACTION_CREATE_DOCUMENT = 'create';
    static CATEGORY_OPENABLE = 'openable';
    static FLAG_GRANT_READ_URI_PERMISSION = 1;
    static FLAG_GRANT_WRITE_URI_PERMISSION = 2;
    constructor(action) { this.action = action; }
    setType(type) { this.type = type; }
    addCategory(category) { this.category = category; }
    addFlags(flags) { this.flags = flags; }
    setFlags(flags) { this.flags = flags; }
    putExtra() {}
  }
  const data = { getData: () => ({}) };
  const activity = {
    getContentResolver: () => resolver,
    getCacheDir: () => '/simulated-cache',
    startActivityForResult(intent, requestCode) {
      state.actions.push(intent);
      if (state.failPhoto && intent.action.includes('PICK_IMAGES')) throw new Error('PHOTO_PICKER_UNAVAILABLE');
      if (state.failStart) throw new Error('START_FAILED');
      if (state.autoResult) queueMicrotask(() => this.onActivityResult(requestCode, state.resultCode, state.emptyData ? null : data));
    },
  };
  const android = {
    runtimeMainActivity: () => activity,
    importClass(name) {
      if (name === 'android.content.Intent') return Intent;
      if (name === 'android.os.Build$VERSION') return { SDK_INT: state.sdk };
      return name;
    },
    newObject(name, object) {
      if (name.includes('Buffered')) return object;
      if (name === 'java.io.FileOutputStream') {
        const channel = closeable({
          write(buffer) {
            if (state.invalidWrite) return undefined;
            if (state.zeroWrite) return 0;
            const count = Math.min(buffer.limit - buffer.position, state.partialWrite ? 2 : Infinity);
            if (!state.overflow) object.payload.push(...buffer.bytes.slice(buffer.position, buffer.position + count));
            object.length += count;
            buffer.position += count;
            return count;
          },
          size: () => state.badLength ? 0 : object.length,
        });
        state.lastTarget = channel;
        return closeable({ getChannel: () => channel });
      }
      throw new Error('Unexpected Java constructor');
    },
    invoke(object, method, ...args) {
      if (object === 'java.io.File') {
        const file = { length: 0, payload: [], deleted: false, getAbsolutePath: () => '/simulated-cache/auth-qr-test.img', delete() { this.deleted = true; return true; } };
        state.files.push(file);
        return file;
      }
      if (object === 'java.nio.ByteBuffer') return { bytes: [], position: 0, limit: 0, flip() { this.limit = this.bytes.length; this.position = 0; }, clear() { this.bytes = []; this.position = 0; } };
      if (object === 'java.nio.channels.Channels') {
        const input = args[0];
        return closeable({ read(buffer) {
          if (state.invalidRead) return undefined;
          const available = state.overflow ? 65536 : state.bytes.length - input.position;
          if (available <= 0) return -1;
          const count = Math.min(65536, available);
          buffer.bytes = state.overflow ? { length: count } : [...state.bytes.slice(input.position, input.position + count)];
          input.position += count;
          return count;
        } });
      }
      return object[method](...args);
    },
  };
  const runtime = { android, os: { name: 'Android' }, barcode: { QR: 0, scan(path, success, failure) {
    state.scans++;
    state.scannedPath = path;
    if (state.scanFail) failure({}); else success(0, 'public-qr-fixture');
  } } };
  return { state, android, activity, runtime };
}

test('Java channel copy handles partial writes, verifies bytes and closes resources', () => {
  const { state, android, activity } = bridge();
  state.partialWrite = true;
  const result = copyImageToCache(android, activity, {});
  assert.deepEqual(result.file.payload, [...state.bytes]);
  assert.equal(result.bytes, state.bytes.length);
  assert.equal(state.lastInput.closed, true);
  assert.equal(state.lastTarget.closed, true);
  assert.equal(result.file.deleted, false, 'keep until barcode recognition finishes');
});

for (const failure of ['invalidRead', 'invalidWrite', 'zeroWrite', 'badLength', 'overflow']) {
  test(`image copy rejects ${failure}, closes streams and deletes partial cache`, () => {
    const { state, android, activity } = bridge();
    state[failure] = true;
    assert.throws(() => copyImageToCache(android, activity, {}), /IMAGE_/);
    assert.equal(state.files[0].deleted, true);
    assert.equal(state.lastInput.closed, true);
    assert.equal(state.lastTarget.closed, true);
  });
}

test('non-image MIME and empty image are rejected without retaining cache data', () => {
  const first = bridge();
  first.state.mime = 'application/octet-stream';
  assert.throws(() => copyImageToCache(first.android, first.activity, {}), /IMAGE_TYPE_INVALID/);
  assert.equal(first.state.files.length, 0);
  const second = bridge();
  second.state.bytes = new Uint8Array();
  assert.throws(() => copyImageToCache(second.android, second.activity, {}), /IMAGE_COPY_INVALID/);
  assert.equal(second.state.files[0].deleted, true);
});

// 模块单例始终绑定同一个模拟 Activity，和真实 app 的单一主 Activity 一致。
const integration = bridge();
globalThis.plus = integration.runtime;

test('system photo picker feeds QR decoder and deletes only its own cache', async () => {
  assert.equal(supportsSystemImageScan(), true);
  const stages = [];
  const result = await scanSystemImage({ onStage: stage => stages.push(stage) });
  assert.equal(result.text, 'public-qr-fixture');
  assert.deepEqual(stages, ['pick', 'read', 'recognize']);
  assert.match(integration.state.actions.at(-1).action, /PICK_IMAGES/);
  assert.equal(integration.state.scannedPath, '/simulated-cache/auth-qr-test.img');
  assert.equal(integration.state.files.at(-1).deleted, true);
});

test('older Android uses documents; unavailable photo picker falls back once', async () => {
  integration.state.sdk = 28;
  await scanSystemImage();
  assert.equal(integration.state.actions.at(-1).action, 'open');
  integration.state.sdk = 33;
  integration.state.failPhoto = true;
  await scanSystemImage();
  assert.match(integration.state.actions.at(-2).action, /PICK_IMAGES/);
  assert.equal(integration.state.actions.at(-1).action, 'open');
  integration.state.failPhoto = false;
});

test('picker cancellation does not decode and subsequent retry succeeds', async () => {
  integration.state.resultCode = 0;
  const before = integration.state.scans;
  assert.equal((await scanSystemImage()).cancelled, true);
  assert.equal(integration.state.scans, before);
  integration.state.resultCode = -1;
  assert.equal((await scanSystemImage()).text, 'public-qr-fixture');
});

test('decode failure and cancellation after copy both clean up temporary images', async () => {
  integration.state.scanFail = true;
  await assert.rejects(scanSystemImage(), /IMAGE_NO_QR/);
  assert.equal(integration.state.files.at(-1).deleted, true);
  integration.state.scanFail = false;
  let cancelled = false;
  const before = integration.state.scans;
  const result = await scanSystemImage({ isCancelled: () => cancelled, onStage: stage => { if (stage === 'recognize') cancelled = true; } });
  assert.equal(result.cancelled, true);
  assert.equal(integration.state.scans, before);
  assert.equal(integration.state.files.at(-1).deleted, true);
});

test('backup and image share routing and cannot overwrite a pending picker', async () => {
  integration.state.autoResult = false;
  const image = scanSystemImage();
  await Promise.resolve();
  let response;
  await pickFileForRead(result => { response = result; });
  assert.match(response.error, /操作进行中/);
  integration.activity.onActivityResult(3001, 0, null);
  assert.equal((await image).cancelled, true);
  integration.state.autoResult = true;
});

test('backup write/read still verifies through shared routing after image operations', async () => {
  const content = JSON.stringify({ fixture: 'public', text: '公开测试' });
  let saved;
  await pickFileForSave('test.mabak', content, result => { saved = result; });
  assert.equal(saved.verified, true);
  let restored;
  await pickFileForRead(result => { restored = result; });
  assert.equal(restored.content, content);
  assert.equal(restored.bytes, new TextEncoder().encode(content).length);
});

test('backup read cancel and failed startup release routing for a subsequent operation', async () => {
  integration.state.resultCode = 0;
  let response;
  await pickFileForRead(result => { response = result; });
  assert.equal(response.cancelled, true);
  integration.state.resultCode = -1;
  integration.state.failStart = true;
  await pickFileForRead(result => { response = result; });
  assert.match(response.error, /START_FAILED/);
  integration.state.failStart = false;
  await pickFileForRead(result => { response = result; });
  assert.equal(response.ok, true);
});
