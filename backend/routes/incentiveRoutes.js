const express = require('express');
const { 
    calculateIncentive, 
    getIncentives, 
    approveIncentive,
    getMyIncentiveSummary 
} = require('../controllers/incentiveController');
const {
  createRevenue,
  getRevenue,
  deleteRevenue,
  calculateMonthly,
  getCalculations,
  approveCalculation,
  payQuarter,
  getMySummary
} = require('../controllers/incentiveEngineController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

// New Incentive Engine
router.post('/revenue', authorize('admin', 'hr', 'manager'), createRevenue);
router.get('/revenue', authorize('admin', 'hr', 'manager', 'employee'), getRevenue);
router.delete('/revenue/:id', authorize('admin', 'hr'), deleteRevenue);

router.post('/calculate-monthly', authorize('admin', 'hr'), calculateMonthly);
router.get('/calculations', authorize('admin', 'hr', 'manager', 'employee'), getCalculations);
router.put('/calculations/:id/approve', authorize('admin', 'hr'), approveCalculation);
router.post('/payout/quarter', authorize('admin', 'hr'), payQuarter);
router.get('/my-summary-v2', getMySummary);

router.post('/calculate', authorize('admin', 'hr'), calculateIncentive);
router.get('/', getIncentives); // Permissions handled inside
router.put('/:id/approve', authorize('admin'), approveIncentive);
router.get('/my-summary', getMyIncentiveSummary);

module.exports = router;
