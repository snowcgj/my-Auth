import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccount } from '../utils/account.js';

const PUBLIC_TEST_SECRET = 'JBSWY3DPEHPK3PXP';

test('a complete account keeps its explicit values', () => {
  const input = {
    id: 42,
    icon: '/static/custom.png',
    app: 'Acme',
    name: 'alice@example.com',
    issuer: 'Acme',
    accountName: 'alice@example.com',
    secret: PUBLIC_TEST_SECRET,
    algorithm: 'SHA1',
    digits: 8,
    period: 60,
    pinned: true,
    sortOrder: 7,
    code: '1234 5678',
    countdown: 12,
  };

  const result = normalizeAccount(input);

  assert.equal(result.id, 42);
  assert.equal(result.icon, '/static/custom.png');
  assert.equal(result.app, 'Acme');
  assert.equal(result.name, 'alice@example.com');
  assert.equal(result.issuer, 'Acme');
  assert.equal(result.accountName, 'alice@example.com');
  assert.equal(result.secret, PUBLIC_TEST_SECRET);
  assert.equal(result.algorithm, 'SHA1');
  assert.equal(result.digits, 8);
  assert.equal(result.period, 60);
  assert.equal(result.pinned, true);
  assert.equal(result.sortOrder, 7);
  assert.equal(result.code, '1234 5678');
  assert.equal(result.countdown, 12);
});

test('missing fields fall back to defaults', () => {
  const result = normalizeAccount({
    id: 1,
    secret: PUBLIC_TEST_SECRET,
  });

  assert.equal(result.id, 1);
  assert.equal(result.icon, '/static/logo.png');
  assert.equal(result.algorithm, 'SHA1');
  assert.equal(result.digits, 6);
  assert.equal(result.period, 30);
  assert.equal(result.pinned, false);
  assert.equal(result.issuer, '');
  assert.equal(result.secret, PUBLIC_TEST_SECRET);
  assert.equal(result.sortOrder, 1);
});

test('unknown fields are preserved', () => {
  const result = normalizeAccount({
    id: 1,
    secret: PUBLIC_TEST_SECRET,
    customFutureField: { note: 'do not drop me' },
    color: '#ff0000',
  });

  assert.deepEqual(result.customFutureField, { note: 'do not drop me' });
  assert.equal(result.color, '#ff0000');
});

test('illegal numeric values are not silently corrected', () => {
  // digits=0 / period=0 must stay, so totp-core rejects them and the card
  // shows "配置不支持" rather than silently producing a 6/30 code.
  const result = normalizeAccount({
    id: 1,
    secret: PUBLIC_TEST_SECRET,
    digits: 0,
    period: 0,
  });

  assert.equal(result.digits, 0);
  assert.equal(result.period, 0);
});

test('unsupported algorithm is preserved, not silently downgraded', () => {
  const result = normalizeAccount({
    id: 1,
    secret: PUBLIC_TEST_SECRET,
    algorithm: 'SHA256',
  });

  assert.equal(result.algorithm, 'SHA256');
});

test('pinned is strict boolean', () => {
  assert.equal(normalizeAccount({ id: 1, secret: PUBLIC_TEST_SECRET, pinned: true }).pinned, true);
  assert.equal(normalizeAccount({ id: 1, secret: PUBLIC_TEST_SECRET, pinned: 1 }).pinned, false);
  assert.equal(normalizeAccount({ id: 1, secret: PUBLIC_TEST_SECRET }).pinned, false);
});

test('missing id and sortOrder get a numeric fallback, equal to each other', () => {
  const result = normalizeAccount({ secret: PUBLIC_TEST_SECRET });

  assert.equal(typeof result.id, 'number');
  assert.ok(result.id > 0);
  assert.equal(result.sortOrder, result.id);
});

test('app/name fall through issuer and accountName when empty', () => {
  const result = normalizeAccount({
    secret: PUBLIC_TEST_SECRET,
    issuer: 'FromIssuer',
    accountName: 'bob@example.com',
  });

  assert.equal(result.app, 'FromIssuer');
  assert.equal(result.name, 'bob@example.com');
  assert.equal(result.accountName, 'bob@example.com');
});
