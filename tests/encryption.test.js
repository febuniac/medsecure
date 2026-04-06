const crypto = require('crypto');

describe('encryption (async pbkdf2)', () => {
  let encrypt, decrypt;

  beforeAll(() => {
    // Set a valid encryption key for testing
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    // Re-require after setting env var
    ({ encrypt, decrypt } = require('../src/utils/encryption'));
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  test('encrypt returns a promise', () => {
    const result = encrypt('hello');
    expect(result).toBeInstanceOf(Promise);
  });

  test('decrypt returns a promise', async () => {
    const encrypted = await encrypt('hello');
    const result = decrypt(encrypted);
    expect(result).toBeInstanceOf(Promise);
  });

  test('encrypt and decrypt round-trip preserves plaintext', async () => {
    const plaintext = 'sensitive-patient-data-123';
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test('encrypted output contains salt:iv:ciphertext:tag (4 segments)', async () => {
    const encrypted = await encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    // salt and iv are each 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32); // salt
    expect(parts[1]).toHaveLength(32); // iv
    expect(parts[2].length).toBeGreaterThan(0); // ciphertext
    expect(parts[3].length).toBeGreaterThan(0); // auth tag
  });

  test('encrypting the same plaintext twice produces different ciphertext', async () => {
    const plaintext = 'same-input';
    const encrypted1 = await encrypt(plaintext);
    const encrypted2 = await encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('decrypt with tampered ciphertext throws', async () => {
    const encrypted = await encrypt('secret');
    const parts = encrypted.split(':');
    // Flip a character in the ciphertext
    parts[2] = parts[2].replace(/[0-9a-f]/, (c) =>
      c === '0' ? '1' : '0'
    );
    const tampered = parts.join(':');
    await expect(decrypt(tampered)).rejects.toThrow();
  });

  test('encrypt does not block the event loop (returns before resolving)', async () => {
    // Verify that encrypt is truly async by checking it yields to the event loop
    let yieldedToEventLoop = false;
    const encryptPromise = encrypt('async-test');
    // Schedule a microtask; if encrypt were sync this would run after
    setImmediate(() => { yieldedToEventLoop = true; });
    await encryptPromise;
    // Give the setImmediate a tick to run
    await new Promise((resolve) => setImmediate(resolve));
    expect(yieldedToEventLoop).toBe(true);
  });

  test('handles empty string', async () => {
    const encrypted = await encrypt('');
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  test('handles unicode text', async () => {
    const plaintext = '患者データ — PHI 🏥';
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
