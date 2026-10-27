import { decodeBase32, normalizeBase32Secret } from './totp-core.js';

const SUPPORTED_TYPE = 'totp';
const DEFAULT_ALGORITHM = 'SHA1';
const SUPPORTED_ALGORITHMS = new Set(['SHA1', 'SHA256', 'SHA512']);
const SUPPORTED_DIGITS = new Set([6, 8]);
const SUPPORTED_PERIODS = new Set([30, 60]);

function invalidUri(message) {
    return new Error(message);
}

function decodeComponent(value, fieldName) {
    try {
        return decodeURIComponent(value);
    } catch {
        throw invalidUri(`otpauth ${fieldName} has invalid percent encoding`);
    }
}

function parseQuery(query) {
    const parameters = new Map();
    if (query === undefined) {
        return parameters;
    }
    if (query.length === 0) {
        return parameters;
    }

    for (const segment of query.split('&')) {
        if (segment.length === 0) {
            throw invalidUri('otpauth query contains an empty parameter');
        }

        const equalsIndex = segment.indexOf('=');
        if (equalsIndex <= 0) {
            throw invalidUri('otpauth query parameter must use name=value');
        }

        const name = decodeComponent(segment.slice(0, equalsIndex), 'parameter name');
        const value = decodeComponent(segment.slice(equalsIndex + 1), 'parameter value');
        if (parameters.has(name)) {
            throw invalidUri('otpauth query contains a duplicate parameter');
        }
        parameters.set(name, value);
    }

    return parameters;
}

function parseLabel(rawLabel) {
    if (rawLabel.length === 0 || rawLabel.includes('/')) {
        throw invalidUri('otpauth label is missing or malformed');
    }

    const label = decodeComponent(rawLabel, 'label').trim();
    if (label.length === 0) {
        throw invalidUri('otpauth account name must not be empty');
    }

    const separatorIndex = label.indexOf(':');
    if (separatorIndex === -1) {
        return { labelIssuer: '', accountName: label };
    }

    const labelIssuer = label.slice(0, separatorIndex).trim();
    const accountName = label.slice(separatorIndex + 1).trim();
    if (labelIssuer.length === 0 || accountName.length === 0) {
        throw invalidUri('otpauth label must contain issuer and account name');
    }

    return { labelIssuer, accountName };
}

function parseOptionalInteger(parameters, name, supportedValues, defaultValue) {
    if (!parameters.has(name)) {
        return defaultValue;
    }

    const value = parameters.get(name).trim();
    if (!/^\d+$/.test(value)) {
        throw invalidUri(`otpauth ${name} must be a number`);
    }

    const parsed = Number.parseInt(value, 10);
    if (!supportedValues.has(parsed)) {
        throw invalidUri(`otpauth ${name} is not supported`);
    }
    return parsed;
}

function parseAlgorithm(parameters) {
    if (!parameters.has('algorithm')) {
        return DEFAULT_ALGORITHM;
    }

    const algorithm = parameters.get('algorithm').trim().toUpperCase();
    if (!SUPPORTED_ALGORITHMS.has(algorithm)) {
        throw invalidUri('otpauth algorithm is not supported');
    }
    return algorithm;
}

function resolveIssuer(labelIssuer, parameters) {
    if (!parameters.has('issuer')) {
        return labelIssuer;
    }

    const queryIssuer = parameters.get('issuer').trim();
    if (queryIssuer.length === 0) {
        throw invalidUri('otpauth issuer must not be empty when provided');
    }
    if (labelIssuer.length > 0 && labelIssuer !== queryIssuer) {
        throw invalidUri('otpauth label issuer and issuer parameter do not match');
    }
    return queryIssuer;
}

export function parseOtpAuthUri(input) {
    if (typeof input !== 'string') {
        throw invalidUri('otpauth URI must be a string');
    }

    const uri = input.trim();
    if (!/^otpauth:\/\//i.test(uri)) {
        throw invalidUri('otpauth URI has an unsupported scheme');
    }
    if (uri.includes('#')) {
        throw invalidUri('otpauth URI must not contain a fragment');
    }

    const withoutScheme = uri.slice('otpauth://'.length);
    const pathStart = withoutScheme.indexOf('/');
    if (pathStart <= 0) {
        throw invalidUri('otpauth URI is missing a type or label');
    }

    const type = withoutScheme.slice(0, pathStart).toLowerCase();
    if (type !== SUPPORTED_TYPE) {
        throw invalidUri('otpauth type is not supported');
    }

    const pathAndQuery = withoutScheme.slice(pathStart + 1);
    const queryStart = pathAndQuery.indexOf('?');
    const rawLabel = queryStart === -1 ? pathAndQuery : pathAndQuery.slice(0, queryStart);
    const rawQuery = queryStart === -1 ? undefined : pathAndQuery.slice(queryStart + 1);
    const { labelIssuer, accountName } = parseLabel(rawLabel);
    const parameters = parseQuery(rawQuery);
    const issuer = resolveIssuer(labelIssuer, parameters);

    if (!parameters.has('secret')) {
        throw invalidUri('otpauth URI is missing secret');
    }
    const secret = parameters.get('secret');
    if (secret.trim().length === 0) {
        throw invalidUri('otpauth secret must not be empty');
    }

    const normalizedSecret = normalizeBase32Secret(secret);
    decodeBase32(normalizedSecret);

    return {
        type,
        issuer,
        accountName,
        secret: normalizedSecret,
        algorithm: parseAlgorithm(parameters),
        digits: parseOptionalInteger(parameters, 'digits', SUPPORTED_DIGITS, 6),
        period: parseOptionalInteger(parameters, 'period', SUPPORTED_PERIODS, 30)
    };
}
