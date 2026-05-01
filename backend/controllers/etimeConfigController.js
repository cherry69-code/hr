const asyncHandler = require('../middlewares/asyncHandler');
const { getPublicEtimeConfig, upsertEtimeConfig, getEtimeConfig } = require('../services/etimeConfigService');
const { fetchDeviceLogsSince } = require('../integrations/etime/etimeDb');

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
    const dbPassword = req.body?.dbPassword;
    const existing = await getEtimeConfig().catch(() => null);
    const hasStoredPassword = Boolean(existing?.password);
    if (!host || !dbName || !dbUser || (!hasStoredPassword && !String(dbPassword || '').trim())) {
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
  const current = await getEtimeConfig();
  const cfg = current
    ? {
        ...current,
        host: req.body?.host !== undefined ? String(req.body.host || '').trim() : current.host,
        database: req.body?.dbName !== undefined ? String(req.body.dbName || '').trim() : current.database,
        user: req.body?.dbUser !== undefined ? String(req.body.dbUser || '').trim() : current.user,
        password: req.body?.dbPassword !== undefined && String(req.body.dbPassword || '').trim()
          ? String(req.body.dbPassword || '')
          : current.password,
        timezone: req.body?.timezone !== undefined ? String(req.body.timezone || '').trim() : current.timezone
      }
    : null;
  if (!cfg) return res.status(400).json({ success: false, error: 'eTime config not set' });
  const since = new Date(Date.now() - 60 * 1000);
  const rows = await fetchDeviceLogsSince(since, cfg);
  res.status(200).json({
    success: true,
    data: {
      ok: true,
      source: 'DeviceLogs',
      rows: Array.isArray(rows) ? rows.length : 0
    }
  });
});
