const crypto = require('crypto');
const fs = require('fs');

const getPublicKeyPem = () => {
  const pem = process.env.RSA_PUBLIC_KEY_PEM || '';
  return pem;
};

const encryptBuffer = (buffer) => {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  const pubPem = getPublicKeyPem();
  let encKeyB64 = '';
  if (pubPem) {
    const encKey = crypto.publicEncrypt(
      { key: pubPem, oaepHash: 'sha256', padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      aesKey
    );
    encKeyB64 = encKey.toString('base64');
  }

  const envelope = JSON.stringify({
    v: 1,
    alg: 'RSA-OAEP/AES-256-GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    encKey: encKeyB64,
    data: ciphertext.toString('base64')
  });
  return Buffer.from(envelope, 'utf8');
};

module.exports = { encryptBuffer };

