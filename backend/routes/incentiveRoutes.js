const express = require('express');
const { 
    calculateIncentive, 
    getIncentives, 
    approveIncentive,
    getMyIncentiveSummary 
} = require('../controllers/incentiveController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/calculate', authorize('admin', 'hr'), calculateIncentive);
router.get('/', getIncentives); // Permissions handled inside
router.put('/:id/approve', authorize('admin'), approveIncentive);
router.get('/my-summary', getMyIncentiveSummary);

module.exports = router;
