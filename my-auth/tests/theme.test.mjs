import test from 'node:test';
import assert from 'node:assert/strict';
import { readTheme, saveTheme, getThemeStyle, THEMES, THEME_STORAGE_KEY } from '../utils/theme.js';

test('missing, invalid or unreadable preference falls back without rewriting storage', () => {
  let writes = 0;
  for (const value of [undefined, '', 'dark', '__proto__', { id: 'green' }]) {
    globalThis.uni = { getStorageSync: () => value, setStorageSync: () => writes++ };
    assert.equal(readTheme(), 'warm');
  }
  uni.getStorageSync = () => { throw new Error('SIMULATED_READ'); };
  assert.equal(readTheme(), 'warm');
  assert.equal(writes, 0);
});

test('selection persists only its preference and can be restored by a different page', () => {
  const accounts = [{ id: 1 }], backup = { fingerprint: 'unchanged' };
  const values = { accounts, backup_meta: backup };
  const writes = [];
  globalThis.uni = { getStorageSync: key => values[key], setStorageSync: (key, value) => { writes.push(key); values[key] = value; } };
  for (const theme of THEMES) {
    assert.equal(saveTheme(theme.id), true);
    assert.equal(readTheme(), theme.id);
  }
  assert.deepEqual(writes, [THEME_STORAGE_KEY, THEME_STORAGE_KEY, THEME_STORAGE_KEY]);
  assert.equal(values.accounts, accounts);
  assert.equal(values.backup_meta, backup);
});

test('invalid selection and failed save preserve the previously stored preference', () => {
  let writes = 0;
  globalThis.uni = { getStorageSync: () => 'violet', setStorageSync: () => { writes++; throw new Error('SIMULATED_WRITE'); } };
  assert.equal(saveTheme('untrusted-css'), false);
  assert.equal(writes, 0);
  assert.equal(saveTheme('green'), false);
  assert.equal(writes, 1);
  assert.equal(readTheme(), 'violet');
});

test('style lookup cannot inject unknown values or mutate the preset for another page', () => {
  const fallback = getThemeStyle('warm');
  assert.deepEqual(getThemeStyle('red;display:none'), fallback);
  const style = getThemeStyle('green');
  style['--auth-paper'] = 'changed';
  assert.notEqual(getThemeStyle('green')['--auth-paper'], 'changed');
  assert.deepEqual(getThemeStyle('warm'), fallback);
});
