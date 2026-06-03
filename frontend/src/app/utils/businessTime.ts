const DEFAULT_TZ_OFFSET_MINUTES = 330;

const getBusinessParts = (date: Date) => {
  const shifted = new Date(date.getTime() + DEFAULT_TZ_OFFSET_MINUTES * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    dayOfMonth: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes()
  };
};

export const getBusinessDateKey = (date: Date = new Date()): string => {
  const p = getBusinessParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.dayOfMonth).padStart(2, '0')}`;
};

export const isMondayWeeklyOff = (date: Date = new Date()): boolean => {
  return getBusinessParts(date).dayOfWeek === 1;
};

// Geo punch allowed on Tuesday–Sunday (IST). Monday is weekly off.
export const isGeoAttendanceAllowedDay = (date: Date = new Date()): boolean => {
  const day = getBusinessParts(date).dayOfWeek;
  return day === 0 || day >= 2;
};

export const isSameBusinessDay = (a: Date, b: Date): boolean => {
  return getBusinessDateKey(a) === getBusinessDateKey(b);
};

export const getCheckInCutoffMinutes = (date: Date): number => {
  const day = getBusinessParts(date).dayOfWeek;
  return day >= 2 && day <= 5 ? 9 * 60 + 45 : 10 * 60;
};

export const isCheckInOnTime = (checkIn: Date): boolean => {
  const parts = getBusinessParts(checkIn);
  return parts.hours * 60 + parts.minutes <= getCheckInCutoffMinutes(checkIn);
};
