const DEFAULT_TZ_OFFSET_MINUTES = 330;

const getBusinessTzOffsetMinutes = () => {
  const raw = Number(process.env.BUSINESS_TZ_OFFSET_MINUTES);
  return Number.isFinite(raw) ? raw : DEFAULT_TZ_OFFSET_MINUTES;
};

const shiftToBusinessClock = (date) => {
  const d = new Date(date);
  return new Date(d.getTime() + getBusinessTzOffsetMinutes() * 60 * 1000);
};

const getBusinessParts = (date) => {
  const shifted = shiftToBusinessClock(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    dayOfMonth: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes()
  };
};

const getBusinessMinutes = (date) => {
  const parts = getBusinessParts(date);
  return parts.hours * 60 + parts.minutes;
};

const parseHmToMinutes = (hm, fallbackMinutes) => {
  const match = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallbackMinutes;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return fallbackMinutes;
  }
  return hh * 60 + mm;
};

const getBusinessDayBounds = (date) => {
  const parts = getBusinessParts(date);
  const offsetMs = getBusinessTzOffsetMinutes() * 60 * 1000;
  const startUtc = Date.UTC(parts.year, parts.month, parts.dayOfMonth, 0, 0, 0, 0) - offsetMs;
  const endUtc = Date.UTC(parts.year, parts.month, parts.dayOfMonth, 23, 59, 59, 999) - offsetMs;
  return {
    start: new Date(startUtc),
    end: new Date(endUtc)
  };
};

module.exports = {
  getBusinessDayBounds,
  getBusinessMinutes,
  getBusinessParts,
  parseHmToMinutes
};
