const express = require('express');
const { protect, authorize } = require('../middlewares/authMiddleware');
const {
  addDevice,
  getMappings,
  upsertMapping,
  deleteMapping,
  getDevices,
  processPunch,
  processAgentLogs,
  getLogs
} = require('../controllers/biometricController');
const { getSyncStatus, getSyncReport, getSyncIssues, retrySyncIssue, runSyncNow, setDeviceToken } = require('../controllers/etimeSyncController');
const { getConfig, updateConfig, testConnection } = require('../controllers/etimeConfigController');

const router = express.Router();

const ipWhitelist = (req, res, next) => {
  const raw = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const clientIp = raw.startsWith('::ffff:') ? raw.replace('::ffff:', '') : raw;
  const allowedRaw = String(process.env.BIOMETRIC_ALLOWED_IPS || '').trim();
  const allowed = allowedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('::ffff:') ? s.replace('::ffff:', '') : s));

  if (!allowed.length) {
    return res.status(403).json({ success: false, error: 'Device IP whitelist not configured' });
  }

  if (!allowed.includes(clientIp)) {
    return res.status(403).json({ success: false, error: 'Access Denied: IP not whitelisted' });
  }
  next();
};

router.post('/punch', ipWhitelist, processPunch);
router.post('/logs', ipWhitelist, processPunch);
router.post('/agent/logs', processAgentLogs);

// Admin Management Endpoints
router.use(protect);
router.use(authorize('admin'));

router.route('/devices')
  .get(getDevices)
  .post(addDevice);

router.route('/mappings')
  .get(getMappings)
  .post(upsertMapping);
router.delete('/mappings/:id', deleteMapping);

router.route('/logs')
  .get(getLogs);

router.get('/sync/status', getSyncStatus);
router.get('/sync/report', getSyncReport);
router.get('/sync/issues', getSyncIssues);
router.post('/sync/issues/:id/retry', retrySyncIssue);
router.post('/sync/run', runSyncNow);
router.post('/devices/:deviceId/token', setDeviceToken);
router.get('/etime-config', getConfig);
router.put('/etime-config', updateConfig);
router.post('/etime-config/test', testConnection);

module.exports = router;
