const asyncHandler = require('../middlewares/asyncHandler');
const { getPublicEtimeConfig, upsertEtimeConfig, getEtimeConfig } = require('../services/etimeConfigService');
const { fetchDeviceLogsSince } = require('../integrations/etime/etimeDb');

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const buildConfigDraft = (current, body) => {
  const payload = body || {};
  return {
    driver: hasOwn(payload, 'driver') ? String(payload.driver || '').trim().toLowerCase() : (current?.driver || 'mssql'),
    host: hasOwn(payload, 'host') ? String(payload.host || '').trim() : String(current?.host || '').trim(),
    database: hasOwn(payload, 'dbName') ? String(payload.dbName || '').trim() : String(current?.database || '').trim(),
    filePath: hasOwn(payload, 'dbPath') ? String(payload.dbPath || '').trim() : String(current?.filePath || '').trim(),
    user: hasOwn(payload, 'dbUser') ? String(payload.dbUser || '').trim() : String(current?.user || '').trim(),
    password: hasOwn(payload, 'dbPassword') ? String(payload.dbPassword || '') : String(current?.password || ''),
    timezone: hasOwn(payload, 'timezone') ? String(payload.timezone || '').trim() : String(current?.timezone || '')
  };
};

exports.getConfig = asyncHandler(async (req, res) => {
  const cfg = await getPublicEtimeConfig();
  res.status(200).json({ success: true, data: cfg });
});

exports.updateConfig = asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled;

  if (enabled === true) {
    const existing = await getEtimeConfig().catch(() => null);
    const cfg = buildConfigDraft(existing, req.body || {});
    if (cfg.driver === 'access') {
      if (!cfg.filePath) {
        return res.status(400).json({
          success: false,
          error: 'dbPath is required when enabling Access sync'
        });
      }
    } else if (!cfg.host || !cfg.database || !cfg.user) {
      return res.status(400).json({
        success: false,
        error: 'host, dbName and dbUser are required when enabling sync'
      });
    }
  }

  await upsertEtimeConfig(req.body || {});
  const cfg = await getPublicEtimeConfig();
  res.status(200).json({ success: true, data: cfg });
});

exports.testConnection = asyncHandler(async (req, res) => {
  const current = await getEtimeConfig();
  const cfg = buildConfigDraft(current, req.body || {});
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
