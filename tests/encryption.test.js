const crypto = require('crypto');

describe('encryption checkHealth', () => {
  const VALID_KEY = crypto.randomBytes(32).toString('hex');
  const originalEnv = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    jest.resetModules();
  });

  function loadEncryption(key) {
    if (key !== undefined) {
      process.env.ENCRYPTION_KEY = key;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    return require('../src/utils/encryption');
  }

  test('returns healthy when ENCRYPTION_KEY is valid', () => {
    const { checkHealth } = loadEncryption(VALID_KEY);
    const result = checkHealth();
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('returns unhealthy when ENCRYPTION_KEY is not set', () => {
    const { checkHealth } = loadEncryption(undefined);
    const result = checkHealth();
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/not configured/i);
  });

  test('returns unhealthy when ENCRYPTION_KEY is empty string', () => {
    const { checkHealth } = loadEncryption('');
    const result = checkHealth();
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/not configured/i);
  });

  test('returns unhealthy when ENCRYPTION_KEY is wrong length', () => {
    const { checkHealth } = loadEncryption('abcd1234');
    const result = checkHealth();
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/256 bits/i);
  });
});
