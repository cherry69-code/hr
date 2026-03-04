const express = require('express');
const { checkIn, checkOut, getAttendance, getTeamSummary } = require('../controllers/attendanceController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/summary/team', getTeamSummary);
router.post('/checkin/:employeeId', checkIn);
router.put('/checkout/:employeeId', checkOut);
router.get('/:employeeId', getAttendance);

module.exports = router;
