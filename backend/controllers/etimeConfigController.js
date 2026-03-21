const asyncHandler = require('../middlewares/asyncHandler');
const { getPublicEtimeConfig, upsertEtimeConfig, getEtimeConfig } = require('../services/etimeConfigService');
const { fetchCheckinOutSince } = require('../integrations/etime/etimeDb');

exports.getConfig = asyncHandler(async (req, res) => {
  const cfg = await getPublicEtimeConfig();
  res.status(200).json({ success: true, data: cfg });
});

exports.updateConfig = asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled;

  if (enabled === true) {
    const host = String(req.body?.host || '').trim();
    const dbName = String(req.body?.dbName || '').trim();
    const dbUser = String(req.body?.dbUser || '').trim();
    const dbPassword = String(req.body?.dbPassword || '').trim();
    if (!host || !dbName || !dbUser || !dbPassword) {
      return res.status(400).json({
        success: false,
        error: 'host, dbName, dbUser and dbPassword are required when enabling sync'
      });
    }
  }

  await upsertEtimeConfig(req.body || {});
  const cfg = await getPublicEtimeConfig();
  res.status(200).json({ success: true, data: cfg });
});

exports.testConnection = asyncHandler(async (req, res) => {
  const cfg = await getEtimeConfig();
  if (!cfg) return res.status(400).json({ success: false, error: 'eTime config not set' });
  const since = new Date(Date.now() - 60 * 1000);
  const rows = await fetchCheckinOutSince(since, cfg);
  res.status(200).json({ success: true, data: { ok: true, rows: Array.isArray(rows) ? rows.length : 0 } });
});

