const express = require('express');
const { grantESOP, getESOPStatus } = require('../controllers/esopController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/grant', authorize('admin', 'hr'), grantESOP);
router.get('/:employeeId', getESOPStatus);

module.exports = router;
