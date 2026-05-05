const fs = require('fs');
const path = require('path');

const DEFAULT_SCHEDULE_TIMES = ['11:00', '15:00', '17:00', '20:00'];

const normalizeScheduleTimes = (input) => {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set();
  const result = [];

  for (const value of raw) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) continue;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      continue;
    }
    const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (seen.has(hhmm)) continue;
    seen.add(hhmm);
    result.push(hhmm);
  }

  return result.length ? result.sort() : [...DEFAULT_SCHEDULE_TIMES];
};

exports.loadConfig = () => {
  const configPath = path.resolve(process.cwd(), process.env.AGENT_CONFIG || 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy config.example.json to config.json first.`);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const config = {
    configPath,
    apiBaseUrl: String(raw.apiBaseUrl || '').trim().replace(/\/+$/, ''),
    deviceId: String(raw.deviceId || '').trim(),
    deviceToken: String(raw.deviceToken || '').trim(),
    databasePath: path.resolve(path.dirname(configPath), String(raw.databasePath || '').trim()),
    dbUser: String(raw.dbUser || 'Admin').trim() || 'Admin',
    dbPassword: String(raw.dbPassword || ''),
    timezone: String(raw.timezone || 'Asia/Kolkata').trim() || 'Asia/Kolkata',
    scheduleTimes: normalizeScheduleTimes(raw.scheduleTimes),
    pollIntervalMs: Math.max(10000, Number(raw.pollIntervalMs || 30000)),
    batchSize: Math.max(1, Math.min(5000, Number(raw.batchSize || 500))),
    requestTimeoutMs: Math.max(5000, Number(raw.requestTimeoutMs || 30000)),
    lookbackHours: Math.max(1, Number(raw.lookbackHours || 72)),
    runOnStartup: raw.runOnStartup !== false,
    stateFile: path.resolve(path.dirname(configPath), String(raw.stateFile || './data/state.json')),
    logDir: path.resolve(path.dirname(configPath), String(raw.logDir || './logs'))
  };

  if (!config.apiBaseUrl) throw new Error('apiBaseUrl is required');
  if (!config.deviceId) throw new Error('deviceId is required');
  if (!config.deviceToken) throw new Error('deviceToken is required');
  if (!config.databasePath) throw new Error('databasePath is required');

  return config;
};
