const EtimeConfig = require('../models/EtimeConfig');

const CONFIG_KEY = 'default';

const safeNumber = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeTimezone = (v) => {
  const tz = String(v || '').trim();
  if (!tz) return 'Asia/Kolkata';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'Asia/Kolkata';
  }
};

const normalizeDriver = (v) => {
  const d = String(v || '').toLowerCase();
  if (d === 'access') return 'access';
  if (d === 'mysql') return 'mysql';
  return 'mssql';
};

const DEFAULT_SCHEDULE_TIMES = ['11:00', '15:00', '17:00', '20:00'];

const normalizeScheduleTimes = (value) => {
  const raw = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const seen = new Set();
  const cleaned = [];
  for (const item of raw) {
    const match = String(item || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) continue;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      continue;
    }
    const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (seen.has(hhmm)) continue;
    seen.add(hhmm);
    cleaned.push(hhmm);
  }

  if (!cleaned.length) return [...DEFAULT_SCHEDULE_TIMES];
  return cleaned.sort();
};

exports.getEtimeConfig = async () => {
  const doc = await EtimeConfig.findOne({ key: CONFIG_KEY }).lean();
  if (!doc) return null;
  const { decryptField } = require('../utils/fieldCrypto');
  const password = doc.dbPasswordEnc ? String(decryptField(doc.dbPasswordEnc) || '') : '';
  return {
    enabled: Boolean(doc.enabled),
    driver: normalizeDriver(doc.driver),
    host: String(doc.host || '').trim(),
    port: safeNumber(doc.port),
    database: String(doc.dbName || '').trim(),
    filePath: String(doc.dbPath || '').trim(),
    user: String(doc.dbUser || '').trim(),
    password,
    startFrom: doc.startFrom ? new Date(doc.startFrom) : null,
    intervalMs: safeNumber(doc.intervalMs) || 300000,
    scheduleTimes: normalizeScheduleTimes(doc.scheduleTimes),
    timezone: normalizeTimezone(doc.timezone),
    updatedAt: doc.updatedAt || null
  };
};

exports.upsertEtimeConfig = async (input) => {
  const { encryptField } = require('../utils/fieldCrypto');

  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : undefined;
  const driver = input.driver !== undefined ? normalizeDriver(input.driver) : undefined;
  const host = input.host !== undefined ? String(input.host || '').trim() : undefined;
  const port = input.port !== undefined ? safeNumber(input.port) : undefined;
  const dbName = input.dbName !== undefined ? String(input.dbName || '').trim() : undefined;
  const dbPath = input.dbPath !== undefined ? String(input.dbPath || '').trim() : undefined;
  const dbUser = input.dbUser !== undefined ? String(input.dbUser || '').trim() : undefined;
  const intervalMs = input.intervalMs !== undefined ? safeNumber(input.intervalMs) : undefined;
  const scheduleTimes = input.scheduleTimes !== undefined ? normalizeScheduleTimes(input.scheduleTimes) : undefined;
  const timezone = input.timezone !== undefined ? normalizeTimezone(input.timezone) : undefined;

  let startFrom = undefined;
  if (input.startFrom !== undefined) {
    const d = new Date(input.startFrom);
    startFrom = Number.isNaN(d.getTime()) ? null : d;
  }

  let dbPasswordEnc = undefined;
  if (input.dbPassword !== undefined) {
    const pw = String(input.dbPassword || '');
    dbPasswordEnc = pw ? encryptField(pw) : '';
  }

  const update = { updatedAt: Date.now() };
  if (enabled !== undefined) update.enabled = enabled;
  if (driver !== undefined) update.driver = driver;
  if (host !== undefined) update.host = host;
  if (port !== undefined) update.port = port;
  if (dbName !== undefined) update.dbName = dbName;
  if (dbPath !== undefined) update.dbPath = dbPath;
  if (dbUser !== undefined) update.dbUser = dbUser;
  if (intervalMs !== undefined) update.intervalMs = intervalMs;
  if (scheduleTimes !== undefined) update.scheduleTimes = scheduleTimes;
  if (timezone !== undefined) update.timezone = timezone;
  if (startFrom !== undefined) update.startFrom = startFrom || undefined;
  if (dbPasswordEnc !== undefined) update.dbPasswordEnc = dbPasswordEnc;

  const doc = await EtimeConfig.findOneAndUpdate(
    { key: CONFIG_KEY },
    { $set: update, $setOnInsert: { key: CONFIG_KEY } },
    { upsert: true, new: true }
  ).lean();

  return doc;
};

exports.getPublicEtimeConfig = async () => {
  const cfg = await exports.getEtimeConfig();
  if (!cfg) return null;
  return {
    enabled: cfg.enabled,
    driver: cfg.driver,
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    filePath: cfg.filePath,
    user: cfg.user,
    startFrom: cfg.startFrom ? cfg.startFrom.toISOString() : null,
    intervalMs: cfg.intervalMs,
    scheduleTimes: cfg.scheduleTimes,
    timezone: cfg.timezone,
    updatedAt: cfg.updatedAt
  };
};
