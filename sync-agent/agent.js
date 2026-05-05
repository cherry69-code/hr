const { loadConfig } = require('./lib/config');
const { createLogger } = require('./lib/logger');
const { loadState, saveState } = require('./lib/checkpointStore');
const { fetchPunchesSince } = require('./lib/accessReader');
const { createApiClient } = require('./lib/apiClient');

const config = loadConfig();
const logger = createLogger(config.logDir);
const api = createApiClient(config);

let state = loadState(config.stateFile);
let running = false;
let lastRunSlot = '';

const getFallbackSince = () => new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000);

const getCurrentScheduleSlot = () => {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  const dateKey = `${formatted.year}-${formatted.month}-${formatted.day}`;
  const currentHm = `${formatted.hour}:${formatted.minute}`;
  if (!config.scheduleTimes.includes(currentHm)) return '';
  return `${dateKey}|${currentHm}`;
};

const chunk = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const persistState = () => saveState(config.stateFile, state);

const syncOnce = async (reason) => {
  if (running) {
    logger.warn('Sync skipped because a previous run is still active', { reason });
    return;
  }

  running = true;
  const startedAt = new Date();
  try {
    const since = state.lastSyncedTime ? new Date(state.lastSyncedTime) : getFallbackSince();
    const rows = await fetchPunchesSince(config, since);
    logger.info('Fetched punch rows from Access MDB', { reason, count: rows.length, since: since.toISOString() });

    let uploaded = 0;
    let latestPunchTime = state.lastSyncedTime ? new Date(state.lastSyncedTime) : null;

    for (const batch of chunk(rows, config.batchSize)) {
      const payload = {
        device_id: config.deviceId,
        logs: batch.map((row) => ({
          ...row,
          punch_time: new Date(row.punch_time).toISOString()
        }))
      };

      const response = await api.pushLogs(payload);
      uploaded += Number(response?.data?.accepted || 0);
      for (const row of batch) {
        const punchTime = new Date(row.punch_time);
        if (!latestPunchTime || punchTime.getTime() > latestPunchTime.getTime()) {
          latestPunchTime = punchTime;
        }
      }
    }

    state = {
      ...state,
      lastRunAt: startedAt.toISOString(),
      lastRunStatus: 'ok',
      lastError: '',
      lastSyncedTime: latestPunchTime ? latestPunchTime.toISOString() : state.lastSyncedTime
    };
    persistState();
    logger.info('Sync completed', {
      reason,
      fetched: rows.length,
      uploaded,
      lastSyncedTime: state.lastSyncedTime || null
    });
  } catch (error) {
    state = {
      ...state,
      lastRunAt: startedAt.toISOString(),
      lastRunStatus: 'error',
      lastError: String(error?.message || error || 'Unknown sync error')
    };
    persistState();
    logger.error('Sync failed', {
      reason,
      error: state.lastError
    });
  } finally {
    running = false;
  }
};

const startScheduler = () => {
  if (config.runOnStartup) {
    syncOnce('startup');
  }

  setInterval(() => {
    const slot = getCurrentScheduleSlot();
    if (!slot || slot === lastRunSlot) return;
    lastRunSlot = slot;
    syncOnce(`schedule:${slot}`);
  }, config.pollIntervalMs);

  logger.info('Windows sync agent started', {
    databasePath: config.databasePath,
    apiBaseUrl: config.apiBaseUrl,
    deviceId: config.deviceId,
    scheduleTimes: config.scheduleTimes
  });
};

if (process.argv.includes('--once')) {
  syncOnce('manual-once').then(() => process.exit(0));
} else {
  startScheduler();
}
