const DEFAULT_TZ_OFFSET_MINUTES = 330;

const getBusinessTzOffsetMinutes = () => {
  const raw = Number(process.env.BUSINESS_TZ_OFFSET_MINUTES);
  return Number.isFinite(raw) && raw !== 0 ? raw : DEFAULT_TZ_OFFSET_MINUTES;
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

const isMondayWeeklyOff = (date) => getBusinessParts(date).dayOfWeek === 1;

// Geo punch allowed on Tuesday–Sunday (IST). Monday (1) is weekly off.
const isGeoAttendanceAllowedDay = (date) => {
  const day = getBusinessParts(date).dayOfWeek;
  return day === 0 || day >= 2;
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

const getDaysInCalendarMonth = (year, monthIndex) => {
  return new Date(Date.UTC(Number(year), Number(monthIndex) + 1, 0)).getUTCDate();
};

const dateFromBusinessCalendar = (year, monthIndex, dayOfMonth) => {
  const offsetMs = getBusinessTzOffsetMinutes() * 60 * 1000;
  return new Date(Date.UTC(Number(year), Number(monthIndex), Number(dayOfMonth), 12, 0, 0, 0) - offsetMs);
};

const businessDateKeyFromParts = (year, monthIndex, dayOfMonth) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

const compareBusinessDates = (a, b) => {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.dayOfMonth - b.dayOfMonth;
};

const eachBusinessCalendarDay = (rangeStart, rangeEnd, fn) => {
  const start = getBusinessParts(rangeStart);
  const end = getBusinessParts(rangeEnd);
  let year = start.year;
  let month = start.month;
  let day = start.dayOfMonth;

  while (compareBusinessDates({ year, month, dayOfMonth: day }, end) <= 0) {
    const dateKey = businessDateKeyFromParts(year, month, day);
    const dateRef = dateFromBusinessCalendar(year, month, day);
    fn({ year, month, dayOfMonth: day, dateKey, dateRef });

    day += 1;
    const daysInMonth = getDaysInCalendarMonth(year, month);
    if (day > daysInMonth) {
      day = 1;
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }
};

const isBusinessMonthComplete = (year, month1to12) => {
  const now = getBusinessParts(new Date());
  if (Number(year) < now.year) return true;
  if (Number(year) > now.year) return false;
  return Number(month1to12) < now.month + 1;
};

module.exports = {
  getBusinessDayBounds,
  getBusinessMinutes,
  getBusinessParts,
  getDaysInCalendarMonth,
  dateFromBusinessCalendar,
  businessDateKeyFromParts,
  eachBusinessCalendarDay,
  isBusinessMonthComplete,
  isGeoAttendanceAllowedDay,
  isMondayWeeklyOff,
  parseHmToMinutes
};
