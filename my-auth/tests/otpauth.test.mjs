import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOtpAuthUri } from '../utils/otpauth.js';

const PUBLIC_TEST_SECRET = 'JBSWY3DPEHPK3PXP';

test('parses a complete TOTP URI', () => {
    const result = parseOtpAuthUri(
        `otpauth://totp/Acme:alice%40example.com?secret=${PUBLIC_TEST_SECRET}&issuer=Acme&algorithm=SHA1&digits=6&period=30`
    );

    assert.deepEqual(result, {
        type: 'totp',
        issuer: 'Acme',
        accountName: 'alice@example.com',
        secret: PUBLIC_TEST_SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 30
    });
});

test('query parameters are parsed by name rather than order', () => {
    const result = parseOtpAuthUri(
        `otpauth://totp/Acme:alice%40example.com?period=60&issuer=Acme&digits=8&secret=${PUBLIC_TEST_SECRET}&algorithm=sha1`
    );

    assert.equal(result.secret, PUBLIC_TEST_SECRET);
    assert.equal(result.issuer, 'Acme');
    assert.equal(result.accountName, 'alice@example.com');
    assert.equal(result.algorithm, 'SHA1');
    assert.equal(result.digits, 8);
    assert.equal(result.period, 60);
});

test('default parameters are SHA1, six digits and thirty seconds', () => {
    const result = parseOtpAuthUri(
        `otpauth://totp/alice%40example.com?secret=${PUBLIC_TEST_SECRET}`
    );

    assert.deepEqual(result, {
        type: 'totp',
        issuer: '',
        accountName: 'alice@example.com',
        secret: PUBLIC_TEST_SECRET,
        algorithm: 'SHA1',
        digits: 6,
        period: 30
    });
});

test('issuer resolution is deterministic', () => {
    const fromQueryOnly = parseOtpAuthUri(
        `otpauth://totp/alice%40example.com?secret=${PUBLIC_TEST_SECRET}&issuer=Acme`
    );
    assert.equal(fromQueryOnly.issuer, 'Acme');

    const matching = parseOtpAuthUri(
        `otpauth://totp/LabelIssuer:alice%40example.com?secret=${PUBLIC_TEST_SECRET}&issuer=LabelIssuer`
    );
    assert.equal(matching.issuer, 'LabelIssuer');

    assert.throws(
        () => parseOtpAuthUri(`otpauth://totp/LabelIssuer:alice%40example.com?secret=${PUBLIC_TEST_SECRET}&issuer=OtherIssuer`),
        /issuer.*do not match/
    );
});

test('label and values are percent decoded', () => {
    const result = parseOtpAuthUri(
        `otpauth://totp/Acme%3Aalice%40example.com?secret=${PUBLIC_TEST_SECRET}&issuer=Acme&image=https%3A%2F%2Fexample.com%2Ficon.png`
    );

    assert.equal(result.issuer, 'Acme');
    assert.equal(result.accountName, 'alice@example.com');
});

test('Base32 formatting rules are explicit', () => {
    const lowerAndWhitespace = parseOtpAuthUri(
        `otpauth://totp/Acme:alice%40example.com?secret=jbsw%20y3dp%09ehpk%0A3pxp&issuer=Acme`
    );
    assert.equal(lowerAndWhitespace.secret, PUBLIC_TEST_SECRET);

    const padded = parseOtpAuthUri('otpauth://totp/Test:foo?secret=MZXW6===');
    assert.equal(padded.secret, 'MZXW6===');
});

test('invalid Base32 is rejected', () => {
    const invalidSecrets = [
        '',
        'A',
        'ABC%21',
        'MZXW6%3D',
        'MZ'
    ];

    for (const secret of invalidSecrets) {
        assert.throws(
            () => parseOtpAuthUri(`otpauth://totp/Test:alice?secret=${secret}`),
            Error
        );
    }
});

test('missing or damaged URI parts are rejected', () => {
    const invalidUris = [
        'not-otpauth://totp/Test:alice?secret=JBSWY3DPEHPK3PXP',
        'otpauth://totp',
        'otpauth://totp/?secret=JBSWY3DPEHPK3PXP',
        'otpauth://totp/Test:alice',
        'otpauth://totp/Test:alice?secret=',
        'otpauth://totp/Test%:alice?secret=JBSWY3DPEHPK3PXP',
        'otpauth://totp/Test:alice?secret',
        `otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}&secret=${PUBLIC_TEST_SECRET}`,
        `otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}#fragment`,
        `otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}&&issuer=Acme`
    ];

    for (const uri of invalidUris) {
        assert.throws(() => parseOtpAuthUri(uri), Error);
    }
});

test('unsupported types and algorithms are rejected', () => {
    assert.throws(
        () => parseOtpAuthUri(`otpauth://hotp/Test:alice?secret=${PUBLIC_TEST_SECRET}&counter=1`),
        /type/
    );
    assert.throws(
        () => parseOtpAuthUri(`otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}&algorithm=SHA256`),
        /algorithm/
    );
    assert.throws(
        () => parseOtpAuthUri(`otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}&algorithm=SHA512`),
        /algorithm/
    );
    assert.throws(
        () => parseOtpAuthUri(`otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}&algorithm=`),
        /algorithm/
    );
});

test('unsupported digits and periods are rejected', () => {
    const invalidParameters = [
        'digits=5',
        'digits=9',
        'digits=six',
        'period=15',
        'period=0',
        'period=abc',
        'period='
    ];

    for (const parameter of invalidParameters) {
        assert.throws(
            () => parseOtpAuthUri(`otpauth://totp/Test:alice?secret=${PUBLIC_TEST_SECRET}&${parameter}`),
            Error
        );
    }
});
