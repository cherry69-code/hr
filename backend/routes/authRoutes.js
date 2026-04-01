const express = require('express');
const { register, login, getMe, forgotPassword, resetPassword, refresh, logout } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

const router = express.Router();

router.post('/register', register);
const loginLimiter = rateLimit({ windowMs: 1000, max: 5, standardHeaders: true, legacyHeaders: false });
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', protect, logout);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
router.get('/me', protect, getMe);

module.exports = router;
