const express = require('express');
const { checkIn, checkOut, getAttendance, getTeamSummary } = require('../controllers/attendanceController');
const { requestCorrection, getCorrectionRequests, updateCorrectionStatus } = require('../controllers/attendanceCorrectionController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

// Correction Routes
router.post('/correction', authorize('admin', 'hr'), requestCorrection);
router.get('/correction', authorize('admin', 'hr'), getCorrectionRequests);
router.put('/correction/:id', authorize('admin'), updateCorrectionStatus);

router.get('/summary/team', authorize('admin', 'hr', 'manager'), getTeamSummary);
router.post('/checkin/:employeeId', checkIn);
router.put('/checkout/:employeeId', checkOut);
router.get('/:employeeId', getAttendance);

module.exports = router;
