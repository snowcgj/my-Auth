import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import CryptoJS from 'crypto-js';
import {
    decodeBase32,
    generateTOTP,
    getTimeWindow,
    normalizeBase32Secret
} from '../utils/totp-core.js';

const RFC_SHA1_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const PUBLIC_TEST_SECRET = 'JBSWY3DPEHPK3PXP';

function encodeBase32(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const byte of bytes) {
        bits += byte.toString(2).padStart(8, '0');
    }

    let encoded = '';
    for (let index = 0; index < bits.length; index += 5) {
        const chunk = bits.slice(index, index + 5).padEnd(5, '0');
        encoded += alphabet[Number.parseInt(chunk, 2)];
    }
    return encoded;
}

function referenceTOTP(keyBytes, timestampSeconds, digits, period, algorithm = 'SHA1') {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(Math.floor(timestampSeconds / period)));
    const digest = createHmac(algorithm.toLowerCase(), keyBytes).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);
    return (binary % 10 ** digits).toString().padStart(digits, '0');
}

// RFC 6238 附录 A/B：三种算法分别使用 20、32、64 字节 ASCII 密钥。
const RFC_KEYS = {
    SHA1: '12345678901234567890',
    SHA256: '12345678901234567890123456789012',
    SHA512: '1234567890123456789012345678901234567890123456789012345678901234'
};
const RFC_VECTORS = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826']
];
for (const [index, algorithm] of Object.keys(RFC_KEYS).entries()) {
    for (const [timestampSeconds, ...expected] of RFC_VECTORS) {
        test(`RFC 6238 ${algorithm} at ${timestampSeconds}`, () => {
            const secret = encodeBase32(Buffer.from(RFC_KEYS[algorithm], 'ascii'));
            assert.equal(generateTOTP({ secret, timestampSeconds, algorithm, digits: 8, period: 30 }), expected[index]);
            assert.equal(generateTOTP({ secret, timestampSeconds, algorithm, digits: 6, period: 30 }), expected[index].slice(-6));
        });
    }
}

test('Node crypto reference matrix', () => {
    const keyLengths = [1, 2, 3, 7, 10, 20, 31, 32, 55, 63, 64, 65, 100, 127, 128, 129, 200];
    const timestamps = [0, 1, 29, 30, 59, 60, 1111111109, 1234567890];

    for (const algorithm of ['SHA1', 'SHA256', 'SHA512']) {
      for (const keyLength of keyLengths) {
        const keyBytes = Uint8Array.from({ length: keyLength }, (_, index) => (index * 37 + 11) % 256);
        const secret = encodeBase32(keyBytes);
        for (const timestampSeconds of timestamps) {
            for (const digits of [6, 8]) {
                for (const period of [30, 60]) {
                    const actual = generateTOTP({ secret, timestampSeconds, digits, period, algorithm });
                    const expected = referenceTOTP(keyBytes, timestampSeconds, digits, period, algorithm);
                    assert.equal(actual, expected);
                }
            }
        }
    }
    }
});

test('time window boundaries and explicit seconds', () => {
    assert.equal(getTimeWindow(0, 30), 0);
    assert.equal(getTimeWindow(29, 30), 0);
    assert.equal(getTimeWindow(30, 30), 1);
    assert.equal(getTimeWindow(59, 60), 0);
    assert.equal(getTimeWindow(60, 60), 1);

    const firstWindow = generateTOTP({ secret: PUBLIC_TEST_SECRET, timestampSeconds: 30, digits: 6, period: 30 });
    assert.equal(
        generateTOTP({ secret: PUBLIC_TEST_SECRET, timestampSeconds: 59, digits: 6, period: 30 }),
        firstWindow
    );
    assert.notEqual(
        generateTOTP({ secret: PUBLIC_TEST_SECRET, timestampSeconds: 60, digits: 6, period: 30 }),
        firstWindow
    );
});

test('leading zero output is preserved', () => {
    let candidate;
    for (let keyLength = 1; keyLength <= 20 && !candidate; keyLength += 1) {
        const keyBytes = Uint8Array.from({ length: keyLength }, (_, index) => index + 1);
        for (let timestampSeconds = 0; timestampSeconds < 5000; timestampSeconds += 1) {
            const expected = referenceTOTP(keyBytes, timestampSeconds, 6, 30);
            if (expected.startsWith('0')) {
                candidate = { keyBytes, timestampSeconds, expected };
                break;
            }
        }
    }

    assert.ok(candidate, 'reference data should include a leading-zero case');
    const secret = encodeBase32(candidate.keyBytes);
    const actual = generateTOTP({
        secret,
        timestampSeconds: candidate.timestampSeconds,
        digits: 6,
        period: 30
    });
    assert.equal(actual, candidate.expected);
    assert.equal(actual.length, 6);
});

test('time windows beyond 32 bits match Node crypto', () => {
    const keyBytes = Uint8Array.from({ length: 20 }, (_, index) => index + 20);
    const secret = encodeBase32(keyBytes);
    const timestampSeconds = 30 * 2 ** 32;
    for (const algorithm of ['SHA1', 'SHA256', 'SHA512']) {
        const actual = generateTOTP({ secret, timestampSeconds, digits: 8, period: 30, algorithm });
        const expected = referenceTOTP(keyBytes, timestampSeconds, 8, 30, algorithm);
        assert.equal(actual, expected);
    }
});

test('Base32 accepts defined formatting forms', () => {
    assert.equal(
        normalizeBase32Secret('jbsw y3dp\tehpk\n3pxp'),
        PUBLIC_TEST_SECRET
    );
    assert.deepEqual([...decodeBase32('MZXW6')], [102, 111, 111]);
    assert.deepEqual([...decodeBase32('mzxw6===')], [102, 111, 111]);
    assert.equal(
        generateTOTP({ secret: 'jbsw y3dp\tehpk\n3pxp', timestampSeconds: 59, digits: 6, period: 30 }),
        generateTOTP({ secret: PUBLIC_TEST_SECRET, timestampSeconds: 59, digits: 6, period: 30 })
    );
});

test('Base32 rejects invalid input', () => {
    const invalidSecrets = [
        '',
        '   ',
        'A',
        'ABC!',
        'MZXW6=',
        'MZXW6===A',
        'MZ',
        123
    ];

    for (const secret of invalidSecrets) {
        assert.throws(() => decodeBase32(secret), Error);
    }
});

test('unsupported or invalid TOTP options fail explicitly', () => {
    const valid = {
        secret: PUBLIC_TEST_SECRET,
        timestampSeconds: 59,
        digits: 6,
        period: 30,
        algorithm: 'SHA1'
    };

    for (const algorithm of ['SHA384', 'MD5', '', 'SHA-256']) {
        assert.throws(() => generateTOTP({ ...valid, algorithm }), /algorithm/);
    }
    assert.throws(() => generateTOTP({ ...valid, digits: 7 }), /6 or 8/);
    assert.throws(() => generateTOTP({ ...valid, digits: '6' }), /6 or 8/);
    assert.throws(() => generateTOTP({ ...valid, period: 45 }), /30 or 60/);
    assert.throws(() => generateTOTP({ ...valid, period: '30' }), /30 or 60/);
    assert.throws(() => generateTOTP({ ...valid, timestampSeconds: -1 }), /timestampSeconds/);
    assert.throws(() => generateTOTP({ ...valid, timestampSeconds: 1.5 }), /timestampSeconds/);
    assert.throws(() => generateTOTP({ ...valid, timestampSeconds: Number.MAX_SAFE_INTEGER + 1 }), /timestampSeconds/);
});

test('equivalent SHA1 spelling is normalized', () => {
    const actual = generateTOTP({
        secret: PUBLIC_TEST_SECRET,
        timestampSeconds: 59,
        digits: 8,
        period: 30,
        algorithm: ' sha1 '
    });
    assert.equal(actual.length, 8);
});

test('SHA2 spelling is normalized and TOTP never needs random bytes', () => {
    const random = CryptoJS.lib.WordArray.random;
    CryptoJS.lib.WordArray.random = () => { throw new Error('TOTP_MUST_NOT_USE_RANDOM'); };
    try {
        for (const algorithm of ['SHA256', 'SHA512']) {
            const input = { secret: PUBLIC_TEST_SECRET, timestampSeconds: 59 };
            assert.equal(generateTOTP({ ...input, algorithm: ` ${algorithm.toLowerCase()} ` }), generateTOTP({ ...input, algorithm }));
            assert.match(generateTOTP({ ...input, algorithm }), /^\d{6}$/);
        }
        assert.equal(generateTOTP({ secret: RFC_SHA1_SECRET, timestampSeconds: 1111111109, digits: 8 }), '07081804');
    } finally { CryptoJS.lib.WordArray.random = random; }
});
