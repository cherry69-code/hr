const { runEtimeSyncOnce } = require('../services/etimeSyncService');
const { getEtimeConfig } = require('../services/etimeConfigService');

let timer = null;
let running = false;
let lastAutoRunKey = '';

const DEFAULT_SCHEDULE_TIMES = ['11:00', '15:00', '17:00', '20:00'];

const getScheduleTimes = (cfg) => {
  const raw = Array.isArray(cfg?.scheduleTimes) && cfg.scheduleTimes.length ? cfg.scheduleTimes : DEFAULT_SCHEDULE_TIMES;
  return raw
    .map((item) => String(item || '').trim())
    .filter((item) => /^\d{2}:\d{2}$/.test(item))
    .sort();
};

const getZonedParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 0),
    day: Number(parts.day || 0),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0)
  };
};

const getCurrentScheduleKey = (scheduleTimes, timeZone) => {
  const now = new Date();
  const zoned = getZonedParts(now, timeZone);
  const today = `${String(zoned.year).padStart(4, '0')}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`;

  for (const hhmm of scheduleTimes) {
    const [hours, minutes] = hhmm.split(':').map((value) => Number(value));
    if (zoned.hour === hours && zoned.minute === minutes) {
      return `${today}|${hhmm}`;
    }
  }

  return '';
};

const getRuntimeConfig = async () => {
  const cfg = await getEtimeConfig().catch(() => null);
  const envEnabled = String(process.env.ETIME_SYNC_ENABLED || '').toLowerCase() === 'true';
  const cfgEnabled = cfg && cfg.enabled !== undefined ? Boolean(cfg.enabled) : undefined;
  const rawInterval = cfg?.intervalMs ?? process.env.ETIME_SYNC_INTERVAL_MS ?? 300000;
  const interval = Number(rawInterval);
  const timeZone = String(cfg?.timezone || process.env.ETIME_TIMEZONE || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
  return {
    enabled: cfgEnabled !== undefined ? cfgEnabled : envEnabled,
    intervalMs: Number.isFinite(interval) && interval >= 10000 ? Math.floor(interval) : 300000,
    timeZone,
    scheduleTimes: getScheduleTimes(cfg)
  };
};

const tick = async () => {
  const runtime = await getRuntimeConfig();
  if (!runtime.enabled) return;
  if (running) return;
  const scheduleKey = getCurrentScheduleKey(runtime.scheduleTimes, runtime.timeZone);
  if (!scheduleKey || scheduleKey === lastAutoRunKey) return;
  running = true;
  try {
    const maxRows = process.env.ETIME_SYNC_MAX_ROWS ? Number(process.env.ETIME_SYNC_MAX_ROWS) : undefined;
    await runEtimeSyncOnce({ maxRows });
    lastAutoRunKey = scheduleKey;
  } catch (e) {
    try {
      const SyncMeta = require('../models/SyncMeta');
      await SyncMeta.updateOne(
        { key: 'etime_checkinout' },
        { $set: { lastRunAt: Date.now(), lastRunStatus: 'error', lastRunMessage: String(e?.message || e) } },
        { upsert: true }
      );
    } catch {}
  } finally {
    running = false;
  }
};

const scheduleNext = async () => {
  const runtime = await getRuntimeConfig();
  timer = setTimeout(async () => {
    await tick();
    await scheduleNext();
  }, Math.min(runtime.intervalMs, 30000));
};

exports.start = () => {
  if (timer) return;
  scheduleNext();
};

exports.stop = () => {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
};
