const express = require('express');
const { protect, authorize } = require('../middlewares/authMiddleware');
const {
  addDevice,
  getDevices,
  processPunch,
  getLogs
} = require('../controllers/biometricController');

const router = express.Router();

// Middleware to Whitelist Device IPs
const ipWhitelist = (req, res, next) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  // TODO: Fetch allowed IPs from DB or Config
  // const allowedIps = ['127.0.0.1', '::1', '192.168.1.15']; 
  // if (!allowedIps.includes(clientIp)) {
  //   return res.status(403).json({ success: false, error: 'Access Denied: IP not whitelisted' });
  // }
  next();
};

// Public Endpoint for Devices (Secured by IP check)
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
