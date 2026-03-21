const express = require('express');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { getShifts, createShift } = require('../controllers/shiftController');

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'hr'));

router.route('/').get(getShifts).post(createShift);

module.exports = router;
