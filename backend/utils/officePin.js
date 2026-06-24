const crypto = require('crypto');
const { getBusinessParts } = require('./businessTime');

const getPinSecret = () => String(process.env.OFFICE_PIN_SECRET || process.env.JWT_SECRET || 'prophr-office-pin');

const getBusinessDateKey = (date = new Date()) => {
  const parts = getBusinessParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.dayOfMonth).padStart(2, '0')}`;
};

const getDailyOfficePin = (locationId, date = new Date()) => {
  const dateKey = getBusinessDateKey(date);
  const hmac = crypto.createHmac('sha256', getPinSecret());
  hmac.update(`${String(locationId)}:${dateKey}`);
  const digest = hmac.digest('hex');
  const num = parseInt(digest.slice(0, 8), 16) % 1000000;
  return String(num).padStart(6, '0');
};

const verifyOfficePin = (locationId, pin, date = new Date()) => {
  const expected = getDailyOfficePin(locationId, date);
  return String(pin || '').trim() === expected;
};

module.exports = {
  getBusinessDateKey,
  getDailyOfficePin,
  verifyOfficePin
};
