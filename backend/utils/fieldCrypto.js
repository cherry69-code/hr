const crypto = require('crypto');

const keyHex = process.env.FIELD_ENC_KEY || '';
if (!keyHex || keyHex.length < 64) {
  // no-op fallback: use zeros (not recommended for production)
}
const key = Buffer.from((keyHex || '').padEnd(64, '0').slice(0, 64), 'hex');

const alg = 'aes-256-gcm';

const encryptField = (plain) => {
  if (!plain && plain !== 0) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(alg, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${enc.toString('base64')}:${iv.toString('base64')}:${tag.toString('base64')}`;
};

const decryptField = (val) => {
  if (typeof val !== 'string' || !val.startsWith('enc:')) return val;
  const [, dataB64, ivB64, tagB64] = val.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(alg, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
};

module.exports = { encryptField, decryptField };

