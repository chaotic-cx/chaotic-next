import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BumpType } from '../interfaces/repo-manager';
import {
  bumpTypeAdjectiveText,
  bumpTypeToText,
  checkEnvironment,
  clampInt,
  decryptAes,
  decryptAesRaw,
  encryptAes,
  encryptAesRaw,
  generateNodeId,
  nDaysInPast,
  pathExists,
} from './functions';

/**
 * Fixture produced by OpenSSL (`enc -aes-256-cbc -md md5 -salt`) which is the
 * exact on-disk format crypto-js passphrase-based AES uses (and what our
 * node:crypto implementation must reproduce to keep legacy data readable).
 */
const OPENSSL_SALTED_FIXTURE = 'U2FsdGVkX1+w9NeBIYdeiFZ4AAgOJ98tGdftoC9DjSM=';
const FIXTURE_KEY = 'test-key';
const FIXTURE_JSON = '"hello world"';

/**
 * The legacy encryptAes double-base64 wrapper around the salted ciphertext.
 * Keep in sync with what old `encryptAes` produced so decryptAes stays
 * backward compatible.
 */
const LEGACY_WRAPPED_FIXTURE = 'VTJGc2RHVmtYMSt3OU5lQklZZGVpRlo0QUFnT0o5OHRHZGZ0b0M5RGpTTT0=';

describe('encryptAesRaw / decryptAesRaw', () => {
  it('round-trips a value', () => {
    const encrypted = encryptAesRaw('hello world', 'some-key');
    expect(decryptAesRaw(encrypted, 'some-key')).toBe('hello world');
  });

  it('uses the OpenSSL salted format (Salted__ prefix)', () => {
    const encrypted = encryptAesRaw('hello world', 'some-key');
    const decoded = Buffer.from(encrypted, 'base64');
    expect(decoded.subarray(0, 8).toString('utf8')).toBe('Salted__');
    expect(decoded.length).toBe(8 + 8 + 16); // salt + ciphertext for one block
  });

  it('produces random ciphertext per call (fresh salt)', () => {
    const first = encryptAesRaw('same value', 'same-key');
    const second = encryptAesRaw('same value', 'same-key');
    expect(first).not.toBe(second);
  });

  it('decrypts a known OpenSSL/crypto-js fixture', () => {
    expect(decryptAesRaw(OPENSSL_SALTED_FIXTURE, FIXTURE_KEY)).toBe(FIXTURE_JSON);
  });

  it('rejects data without a Salted__ header', () => {
    expect(() => decryptAesRaw('aGVsbG8gd29ybGQ=', FIXTURE_KEY)).toThrow('Invalid encrypted data');
  });

  it('rejects data that is too short', () => {
    expect(() => decryptAesRaw(Buffer.from('Salted__').toString('base64'), FIXTURE_KEY)).toThrow(
      'Invalid encrypted data',
    );
  });

  it('throws on a wrong key', () => {
    expect(() => decryptAesRaw(OPENSSL_SALTED_FIXTURE, 'wrong-key')).toThrow();
  });
});

describe('encryptAes / decryptAes (legacy wrapper)', () => {
  it('round-trips a value', () => {
    const encrypted = encryptAes('hello world', 'some-key');
    expect(decryptAes(encrypted, 'some-key')).toBe('hello world');
  });

  it('decrypts a known legacy double-base64 fixture', () => {
    expect(decryptAes(LEGACY_WRAPPED_FIXTURE, FIXTURE_KEY)).toBe('hello world');
  });

  it('remains compatible with data produced by the old crypto-js encryptAes', () => {
    // Simulate the old path: AES-encrypt JSON.stringify(value), base64-wrap the result.
    const raw = encryptAesRaw(FIXTURE_JSON, FIXTURE_KEY);
    const legacyEncoded = Buffer.from(raw, 'utf8').toString('base64');
    expect(decryptAes(legacyEncoded, FIXTURE_KEY)).toBe('hello world');
  });
});

describe('generateNodeId', () => {
  let originalHostname: string | undefined;

  beforeEach(() => {
    originalHostname = process.env.HOSTNAME;
  });

  afterEach(() => {
    if (originalHostname === undefined) delete process.env.HOSTNAME;
    else process.env.HOSTNAME = originalHostname;
  });

  it('includes the HOSTNAME when set', () => {
    process.env.HOSTNAME = 'test-node';
    expect(generateNodeId()).toMatch(/^test-node-[a-z0-9]+$/);
  });

  it('falls back to the backend prefix when HOSTNAME is unset', () => {
    delete process.env.HOSTNAME;
    expect(generateNodeId()).toMatch(/^backend-[a-z0-9]+$/);
  });

  it('produces a different id on each call', () => {
    expect(generateNodeId()).not.toBe(generateNodeId());
  });
});

describe('checkEnvironment', () => {
  function config(values: Record<string, string | undefined>, nodeEnv = 'production') {
    return {
      get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : values[key]),
    } as unknown as import('@nestjs/config').ConfigService;
  }

  it('throws when a required prod variable is missing', () => {
    expect(() => checkEnvironment(config({}))).toThrow(/Missing environment variables/);
  });

  it('throws listing all missing variables', () => {
    let message = '';
    try {
      checkEnvironment(config({}));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('PG_DATABASE');
    expect(message).toContain('PG_HOST');
  });

  it('uses the dev required set in development mode', () => {
    expect(() => checkEnvironment(config({}, 'development'))).toThrow(/REDIS_PASSWORD/);
  });
});

describe('nDaysInPast', () => {
  const NOW = new Date('2026-08-12T12:00:00.000Z');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  beforeAll(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns the current instant when n is 0', () => {
    expect(nDaysInPast(0)).toEqual(NOW);
  });

  it('returns a date n days ago', () => {
    const days = 10;
    expect(nDaysInPast(days).getTime()).toBe(NOW.getTime() - days * MS_PER_DAY);
  });
});

describe('clampInt', () => {
  it('returns the value when it is inside the range', () => {
    expect(clampInt(5, 1, 10)).toBe(5);
  });

  it('clamps a value below min to min', () => {
    expect(clampInt(0, 1, 10)).toBe(1);
  });

  it('clamps a value above max to max', () => {
    expect(clampInt(99, 1, 10)).toBe(10);
  });

  it('accepts the value at the min boundary', () => {
    expect(clampInt(1, 1, 10)).toBe(1);
  });

  it('accepts the value at the max boundary', () => {
    expect(clampInt(10, 1, 10)).toBe(10);
  });

  it('clamps a value below a negative min to min', () => {
    expect(clampInt(-3, -1, 2)).toBe(-1);
  });

  it('returns NaN for a NaN input', () => {
    expect(clampInt(NaN, 1, 10)).toBeNaN();
  });
});

describe('bumpTypeToText', () => {
  it.each([
    [BumpType.EXPLICIT, 'explicitly'],
    [BumpType.GLOBAL, 'globally'],
    [BumpType.FROM_DEPS, 'via Arch dependencies'],
    [BumpType.FROM_DEPS_CHAOTIC, 'via Chaotic dependencies'],
    [BumpType.PLUGIN, 'via a plugin ABI break'],
    [BumpType.BROKEN_DEPS, 'via a broken dependency'],
  ])('returns the adverb form for %s', (type, expected) => {
    expect(bumpTypeToText(type)).toBe(expected);
  });

  it('returns Unknown for an out-of-range value', () => {
    expect(bumpTypeToText(999 as BumpType)).toBe('Unknown');
  });
});

describe('bumpTypeAdjectiveText', () => {
  it.each([
    [BumpType.EXPLICIT, 'explicit'],
    [BumpType.GLOBAL, 'global'],
    [BumpType.FROM_DEPS, 'Arch dependency'],
    [BumpType.FROM_DEPS_CHAOTIC, 'Chaotic dependency'],
    [BumpType.PLUGIN, 'plugin ABI break'],
    [BumpType.BROKEN_DEPS, 'broken dependency'],
  ])('returns the attributive form for %s', (type, expected) => {
    expect(bumpTypeAdjectiveText(type)).toBe(expected);
  });

  it('returns Unknown for an out-of-range value', () => {
    expect(bumpTypeAdjectiveText(999 as BumpType)).toBe('Unknown');
  });
});

describe('pathExists', () => {
  it('returns true for an existing file', async () => {
    expect(await pathExists(__filename)).toBe(true);
  });

  it('returns false for a missing file', async () => {
    expect(await pathExists('/nonexistent/definitely/not/here')).toBe(false);
  });
});
