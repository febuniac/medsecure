const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2 = promisify(crypto.pbkdf2);

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = 'sha512';

/**
 * Derive a 256-bit key from the ENCRYPTION_KEY env var using async PBKDF2.
 * A per-operation salt is used so that identical plaintext produces different
 * ciphertext each time.  The salt is stored alongside the ciphertext.
 */
async function deriveKey(salt) {
  const secret = process.env.ENCRYPTION_KEY || '';
  return pbkdf2(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
}

async function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(16);
  const key = await deriveKey(salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted + ':' + tag;
}

async function decrypt(data) {
  const [saltHex, ivHex, encrypted, tagHex] = data.split(':');
  const key = await deriveKey(Buffer.from(saltHex, 'hex'));
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
