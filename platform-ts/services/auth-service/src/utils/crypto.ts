import * as crypto from 'crypto';

const keyFromEnv = () => {
  const raw = String(process.env.FIELD_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY required');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes base64');
  return buf;
};

export const encryptString = (plaintext: string) => {
  const key = keyFromEnv();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(String(plaintext), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
};

export const decryptString = (payload: string) => {
  const key = keyFromEnv();
  const raw = Buffer.from(String(payload), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};

export const sha256Hex = (v: string) => crypto.createHash('sha256').update(String(v)).digest('hex');

