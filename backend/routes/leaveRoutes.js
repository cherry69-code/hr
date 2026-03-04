const express = require('express');
const { applyLeave, getLeaves, updateLeaveStatus } = require('../controllers/leaveController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', applyLeave);
router.get('/', getLeaves);
router.put('/:id', authorize('admin', 'hr', 'manager'), updateLeaveStatus);

module.exports = router;
