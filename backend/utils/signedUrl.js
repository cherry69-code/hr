const crypto = require('crypto');

const getSecret = () => String(process.env.DOC_URL_SIGNING_SECRET || process.env.JWT_SECRET || '');

const sign = ({ id, employeeId, expiresAtMs }) => {
  const secret = getSecret();
  const msg = `${id}:${employeeId}:${expiresAtMs}`;
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
};

const verify = ({ id, employeeId, expiresAtMs, sig }) => {
  if (!sig) return false;
  if (!expiresAtMs || Number(expiresAtMs) < Date.now()) return false;
  const expected = sign({ id, employeeId, expiresAtMs });
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(String(sig), 'hex'));
  } catch {
    return false;
  }
};

module.exports = { sign, verify };
