const { runEtimeSyncOnce } = require('../services/etimeSyncService');

let timer = null;
let running = false;

const enabled = () => String(process.env.ETIME_SYNC_ENABLED || '').toLowerCase() === 'true';
const intervalMs = () => {
  const v = Number(process.env.ETIME_SYNC_INTERVAL_MS || 60000);
  if (!Number.isFinite(v) || v < 10000) return 60000;
  return Math.floor(v);
};

const tick = async () => {
  if (!enabled()) return;
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

exports.start = () => {
  if (timer) return;
  timer = setInterval(tick, intervalMs());
  tick();
};

exports.stop = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};
