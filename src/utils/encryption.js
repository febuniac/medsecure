const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + encrypted + ':' + tag;
}

function decrypt(data) {
  const [ivHex, encrypted, tagHex] = data.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function checkHealth() {
  try {
    if (!process.env.ENCRYPTION_KEY) {
      return { healthy: false, reason: 'ENCRYPTION_KEY not configured' };
    }
    if (KEY.length !== 32) {
      return { healthy: false, reason: 'ENCRYPTION_KEY must be 256 bits (32 bytes)' };
    }
    const testPlaintext = 'phi-encryption-health-check';
    const encrypted = encrypt(testPlaintext);
    const decrypted = decrypt(encrypted);
    if (decrypted !== testPlaintext) {
      return { healthy: false, reason: 'Encrypt/decrypt round-trip verification failed' };
    }
    return { healthy: true };
  } catch (err) {
    return { healthy: false, reason: `Encryption service error: ${err.message}` };
  }
}

module.exports = { encrypt, decrypt, checkHealth };
