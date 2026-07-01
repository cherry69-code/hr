const { getBusinessParts, isGeoAttendanceAllowedDay } = require('./businessTime');

const HQ2_WEEKEND_GEO_MESSAGE =
  'GPS check-in is not available at HQ2 on Saturday and Sunday. Use Office PIN instead.';

const isHq2Location = (location) => {
  const name = String(location?.name || '').trim().toLowerCase();
  return /\bhq\s*-?\s*2\b/.test(name);
};

const isWeekendDay = (date = new Date()) => {
  const day = getBusinessParts(date).dayOfWeek;
  return day === 0 || day === 6;
};

const isGeoAllowedAtLocation = (location, date = new Date()) => {
  if (!isGeoAttendanceAllowedDay(date)) return false;
  if (location && isHq2Location(location) && isWeekendDay(date)) return false;
  return true;
};

const geoBlockMessageForLocation = (location, date = new Date()) => {
  if (!isGeoAttendanceAllowedDay(date)) {
    return 'Monday is weekly off. Geo punch is allowed Tuesday to Sunday only.';
  }
  if (location && isHq2Location(location) && isWeekendDay(date)) {
    return HQ2_WEEKEND_GEO_MESSAGE;
  }
  return '';
};

module.exports = {
  HQ2_WEEKEND_GEO_MESSAGE,
  isHq2Location,
  isWeekendDay,
  isGeoAllowedAtLocation,
  geoBlockMessageForLocation
};
