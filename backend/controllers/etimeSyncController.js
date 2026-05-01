const asyncHandler = require('../middlewares/asyncHandler');
const BiometricDevice = require('../models/BiometricDevice');
const BiometricSyncIssue = require('../models/BiometricSyncIssue');
const { getEtimeSyncStatus, getEtimeSyncReport, runEtimeSyncOnce, retryBiometricSyncIssue, hashDeviceToken } = require('../services/etimeSyncService');
const crypto = require('crypto');

exports.getSyncStatus = asyncHandler(async (req, res) => {
  const status = await getEtimeSyncStatus();
  res.status(200).json({ success: true, data: status });
});

exports.runSyncNow = asyncHandler(async (req, res) => {
  const maxRows = req.body && req.body.maxRows ? Number(req.body.maxRows) : undefined;
  const result = await runEtimeSyncOnce({ maxRows });
  res.status(200).json({ success: true, data: result });
});

exports.getSyncReport = asyncHandler(async (req, res) => {
  const report = await getEtimeSyncReport();
  res.status(200).json({ success: true, data: report });
});

exports.getSyncIssues = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
  const status = req.query.status ? String(req.query.status).trim() : '';
  const query = {};
  if (status) query.status = status;

  const issues = await BiometricSyncIssue.find(query)
    .populate('employeeId', '_id fullName employeeId email designation status')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json({ success: true, count: issues.length, data: issues });
});

exports.retrySyncIssue = asyncHandler(async (req, res) => {
  const result = await retryBiometricSyncIssue(String(req.params.id || '').trim());
  res.status(200).json({ success: true, data: result });
});

exports.setDeviceToken = asyncHandler(async (req, res) => {
  const deviceId = String(req.params.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId is required' });

  const device = await BiometricDevice.findOne({ deviceId });
  if (!device) return res.status(404).json({ success: false, error: 'Device not found' });

  const provided = String(req.body?.token || '').trim();
  const tokenPlain = provided || crypto.randomBytes(24).toString('hex');
  device.apiTokenHash = hashDeviceToken(tokenPlain);
  await device.save();

  res.status(200).json({ success: true, data: { deviceId: device.deviceId, token: tokenPlain } });
});
