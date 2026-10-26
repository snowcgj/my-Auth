const SUPPORTED_ALGORITHM = 'SHA1';
const SUPPORTED_DIGITS = new Set([6, 8]);
const SUPPORTED_PERIODS = new Set([30, 60]);
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VALID_UNPADDED_REMAINDERS = new Set([0, 2, 4, 5, 7]);
const REQUIRED_PADDING_BY_REMAINDER = new Map([
    [0, 0],
    [2, 6],
    [4, 4],
    [5, 3],
    [7, 1]
]);

function invalidInput(message) {
    return new Error(message);
}

export function normalizeBase32Secret(secret) {
    if (typeof secret !== 'string') {
        throw invalidInput('TOTP secret must be a Base32 string');
    }

    const normalized = secret.replace(/[ \t\r\n]/g, '').toUpperCase();
    if (normalized.length === 0) {
        throw invalidInput('TOTP secret must not be empty');
    }

    const paddingIndex = normalized.indexOf('=');
    let data = normalized;

    if (paddingIndex !== -1) {
        data = normalized.slice(0, paddingIndex);
        const padding = normalized.slice(paddingIndex);
        if (!/^=+$/.test(padding)) {
            throw invalidInput('TOTP secret has invalid Base32 padding');
        }
        if (normalized.length % 8 !== 0) {
            throw invalidInput('TOTP secret has invalid Base32 padding length');
        }
        const requiredPadding = REQUIRED_PADDING_BY_REMAINDER.get(data.length % 8);
        if (requiredPadding !== padding.length) {
            throw invalidInput('TOTP secret has invalid Base32 padding');
        }
    } else if (!VALID_UNPADDED_REMAINDERS.has(normalized.length % 8)) {
        throw invalidInput('TOTP secret has an invalid Base32 length');
    }

    if (data.length === 0) {
        throw invalidInput('TOTP secret must not be empty');
    }

    for (const character of data) {
        if (!BASE32_ALPHABET.includes(character)) {
            throw invalidInput('TOTP secret contains a character outside Base32');
        }
    }

    return normalized;
}

export function decodeBase32(secret) {
    const normalized = normalizeBase32Secret(secret);
    const data = normalized.replace(/=+$/, '');
    let bits = '';

    for (const character of data) {
        bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0');
    }

    const byteLength = Math.floor(bits.length / 8);
    const remainingBits = bits.slice(byteLength * 8);
    if (/1/.test(remainingBits)) {
        throw invalidInput('TOTP secret is not canonically Base32 encoded');
    }

    const bytes = [];
    for (let index = 0; index < byteLength; index += 1) {
        bytes.push(Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2));
    }
    return new Uint8Array(bytes);
}

function sha1(message) {
    function rotateLeft(value, shift) {
        return (value << shift) | (value >>> (32 - shift));
    }

    function uint8ArrayToWordArray(bytes) {
        const words = [];
        for (let index = 0; index < bytes.length; index += 1) {
            words[index >>> 2] |= bytes[index] << (24 - (index % 4) * 8);
        }
        return { words, sigBytes: bytes.length };
    }

    function wordArrayToUint8Array(wordArray) {
        const bytes = [];
        for (let index = 0; index < wordArray.sigBytes; index += 1) {
            const byte = (wordArray.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
            bytes.push(byte);
        }
        return new Uint8Array(bytes);
    }

    const wordArray = uint8ArrayToWordArray(message);
    const bitLength = wordArray.sigBytes * 8;
    wordArray.words[bitLength >>> 5] |= 0x80 << (24 - (bitLength % 32));
    wordArray.words[((bitLength + 64 >>> 9) << 4) + 15] = bitLength;
    wordArray.sigBytes = wordArray.words.length * 4;

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    for (let block = 0; block < wordArray.words.length; block += 16) {
        const words = new Array(80);
        for (let round = 0; round < 80; round += 1) {
            if (round < 16) {
                words[round] = wordArray.words[block + round] || 0;
            } else {
                words[round] = rotateLeft(
                    words[round - 3] ^ words[round - 8] ^ words[round - 14] ^ words[round - 16],
                    1
                );
            }
        }

        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;

        for (let round = 0; round < 80; round += 1) {
            const temp = (
                rotateLeft(a, 5) +
                (
                    round < 20
                        ? ((b & c) | (~b & d)) + 0x5a827999
                        : round < 40
                            ? (b ^ c ^ d) + 0x6ed9eba1
                            : round < 60
                                ? ((b & c) | (b & d) | (c & d)) - 0x70e44324
                                : (b ^ c ^ d) - 0x359d3e2a
                ) +
                e +
                words[round]
            ) | 0;

            e = d;
            d = c;
            c = rotateLeft(b, 30);
            b = a;
            a = temp;
        }

        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    }

    return wordArrayToUint8Array({ words: [h0, h1, h2, h3, h4], sigBytes: 20 });
}

function hmacSha1(key, message) {
    const blockSize = 64;
    let normalizedKey = key;
    if (normalizedKey.length > blockSize) {
        normalizedKey = sha1(normalizedKey);
    }

    const paddedKey = new Uint8Array(blockSize);
    paddedKey.set(normalizedKey);

    const outerKeyPad = new Uint8Array(blockSize);
    const innerKeyPad = new Uint8Array(blockSize);
    for (let index = 0; index < blockSize; index += 1) {
        outerKeyPad[index] = paddedKey[index] ^ 0x5c;
        innerKeyPad[index] = paddedKey[index] ^ 0x36;
    }

    const innerHash = sha1(new Uint8Array([...innerKeyPad, ...message]));
    return sha1(new Uint8Array([...outerKeyPad, ...innerHash]));
}

function normalizeOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw invalidInput('TOTP options must be an object');
    }

    const algorithm = String(options.algorithm ?? SUPPORTED_ALGORITHM).trim().toUpperCase();
    if (algorithm !== SUPPORTED_ALGORITHM) {
        throw invalidInput('Only SHA1 TOTP is supported');
    }

    const digits = options.digits ?? 6;
    if (!Number.isInteger(digits) || !SUPPORTED_DIGITS.has(digits)) {
        throw invalidInput('TOTP digits must be 6 or 8');
    }

    const period = options.period ?? 30;
    if (!Number.isInteger(period) || !SUPPORTED_PERIODS.has(period)) {
        throw invalidInput('TOTP period must be 30 or 60 seconds');
    }

    const timestampSeconds = options.timestampSeconds;
    if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
        throw invalidInput('TOTP timestampSeconds must be a non-negative safe integer');
    }

    return { algorithm, digits, period, timestampSeconds };
}

export function getTimeWindow(timestampSeconds, period = 30) {
    if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < 0) {
        throw invalidInput('TOTP timestampSeconds must be a non-negative safe integer');
    }
    if (!Number.isInteger(period) || !SUPPORTED_PERIODS.has(period)) {
        throw invalidInput('TOTP period must be 30 or 60 seconds');
    }
    return Math.floor(timestampSeconds / period);
}

function timeWindowToBytes(timeWindow) {
    const buffer = new Uint8Array(8);
    let remaining = timeWindow;

    for (let index = 7; index >= 0; index -= 1) {
        buffer[index] = remaining % 256;
        remaining = Math.floor(remaining / 256);
    }

    return buffer;
}

export function generateTOTP(options) {
    const { digits, period, timestampSeconds } = normalizeOptions(options);
    const key = decodeBase32(options.secret);
    const timeWindow = getTimeWindow(timestampSeconds, period);
    const hmac = hmacSha1(key, timeWindowToBytes(timeWindow));
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    const code = binary % 10 ** digits;

    return code.toString().padStart(digits, '0');
}
