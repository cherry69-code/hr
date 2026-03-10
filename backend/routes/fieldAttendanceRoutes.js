const express = require('express');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { fieldCheckIn, fieldCheckOut, getFieldLogs } = require('../controllers/fieldAttendanceController');

const router = express.Router();

router.post('/checkin', protect, fieldCheckIn);
router.post('/checkout', protect, fieldCheckOut);

router.get('/logs', protect, authorize('admin', 'hr'), getFieldLogs);

module.exports = router;
