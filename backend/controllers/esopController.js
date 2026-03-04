const ESOP = require('../models/ESOP');
const asyncHandler = require('../middlewares/asyncHandler');

// Vesting Calculation Logic
const calculateVestedShares = (grant) => {
  const today = new Date();
  const start = new Date(grant.vestingStartDate);

  // Calculate months elapsed
  const monthsElapsed = 
    (today.getFullYear() - start.getFullYear()) * 12 + 
    (today.getMonth() - start.getMonth());

  // Check cliff period
  if (monthsElapsed < grant.cliffMonths) {
    return 0;
  }

  // Monthly vesting
  const monthlyVesting = grant.totalGranted / grant.vestingPeriodMonths;
  const vested = Math.floor(monthlyVesting * monthsElapsed);

  return Math.min(vested, grant.totalGranted);
};

// @desc    Grant ESOP to employee
// @route   POST /api/esop/grant
// @access  Private/Admin
exports.grantESOP = asyncHandler(async (req, res, next) => {
  const { employeeId, totalGranted, vestingStartDate, vestingPeriodMonths, cliffMonths } = req.body;

  const esop = await ESOP.create({
    employeeId,
    totalGranted,
    vestingStartDate,
    vestingPeriodMonths: vestingPeriodMonths || 48,
    cliffMonths: cliffMonths || 12
  });

  res.status(201).json({ success: true, data: esop });
});

// @desc    Get ESOP status for an employee
// @route   GET /api/esop/:employeeId
// @access  Private
exports.getESOPStatus = asyncHandler(async (req, res, next) => {
  const employeeId = req.params.employeeId;

  // Security check: employees can only view their own
  if (req.user.role === 'employee' && req.user.id !== employeeId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const grants = await ESOP.find({ employeeId });
  
  const results = grants.map(grant => {
    const vested = calculateVestedShares(grant);
    const unvested = grant.totalGranted - vested;
    
    // We can update the DB record here too if needed, but calculation on fly is safer for read-heavy
    return {
      ...grant.toObject(),
      vestedShares: vested,
      unvestedShares: unvested
    };
  });

  res.status(200).json({ success: true, count: results.length, data: results });
});
