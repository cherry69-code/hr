const { runEtimeSyncOnce } = require('../services/etimeSyncService');
const { getEtimeConfig } = require('../services/etimeConfigService');

let timer = null;
let running = false;

const getRuntimeConfig = async () => {
  const cfg = await getEtimeConfig().catch(() => null);
  const envEnabled = String(process.env.ETIME_SYNC_ENABLED || '').toLowerCase() === 'true';
  const cfgEnabled = cfg && cfg.enabled !== undefined ? Boolean(cfg.enabled) : undefined;
  const rawInterval = cfg?.intervalMs ?? process.env.ETIME_SYNC_INTERVAL_MS ?? 300000;
  const interval = Number(rawInterval);
  return {
    enabled: cfgEnabled !== undefined ? cfgEnabled : envEnabled,
    intervalMs: Number.isFinite(interval) && interval >= 10000 ? Math.floor(interval) : 300000
  };
};

const tick = async () => {
  const runtime = await getRuntimeConfig();
  if (!runtime.enabled) return;
  if (running) return;
  running = true;
  try {
    const maxRows = process.env.ETIME_SYNC_MAX_ROWS ? Number(process.env.ETIME_SYNC_MAX_ROWS) : undefined;
    await runEtimeSyncOnce({ maxRows });
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
  }, runtime.intervalMs);
};

exports.start = () => {
  if (timer) return;
  tick();
  scheduleNext();
};

exports.stop = () => {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
};
