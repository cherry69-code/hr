const express = require('express');
const { protect, authorize } = require('../middlewares/authMiddleware');
const {
  addDevice,
  getDevices,
  processPunch,
  getLogs
} = require('../controllers/biometricController');

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

// Admin Management Endpoints
router.use(protect);
router.use(authorize('admin'));

router.route('/devices')
  .get(getDevices)
  .post(addDevice);

router.route('/logs')
  .get(getLogs);

module.exports = router;
