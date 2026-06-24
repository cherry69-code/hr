const crypto = require('crypto');
const { getBusinessParts } = require('./businessTime');

const BUSINESS_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_TZ_OFFSET_MINUTES = 330;

const getBusinessTzOffsetMinutes = () => {
  const raw = Number(process.env.BUSINESS_TZ_OFFSET_MINUTES);
  return Number.isFinite(raw) && raw !== 0 ? raw : DEFAULT_TZ_OFFSET_MINUTES;
};

const getPinSecret = () => String(process.env.OFFICE_PIN_SECRET || process.env.JWT_SECRET || 'prophr-office-pin');

const getBusinessDateKey = (date = new Date()) => {
  const parts = getBusinessParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.dayOfMonth).padStart(2, '0')}`;
};

const dateForBusinessDay = (year, monthIndex, dayOfMonth) => {
  const offsetMs = getBusinessTzOffsetMinutes() * 60 * 1000;
  const utc = Date.UTC(year, monthIndex, dayOfMonth, 12, 0, 0, 0) - offsetMs;
  return new Date(utc);
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

const getMonthOfficePinSchedule = (locationId, year, month) => {
  const monthIndex = month - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const schedule = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = dateForBusinessDay(year, monthIndex, day);
    const parts = getBusinessParts(date);
    schedule.push({
      businessDate: getBusinessDateKey(date),
      dayName: BUSINESS_DAY_NAMES[parts.dayOfWeek] || 'Unknown',
      dayOfWeek: parts.dayOfWeek,
      officePin: getDailyOfficePin(locationId, date)
    });
  }

  return schedule;
};

module.exports = {
  BUSINESS_DAY_NAMES,
  getBusinessDateKey,
  getDailyOfficePin,
  getMonthOfficePinSchedule,
  verifyOfficePin
};
