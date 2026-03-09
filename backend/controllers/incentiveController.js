const Incentive = require('../models/Incentive');
const Slab = require('../models/Slab');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');

// @desc    Calculate Incentive
// @route   POST /api/incentives/calculate
// @access  Private (Admin/HR)
exports.calculateIncentive = asyncHandler(async (req, res, next) => {
  const { employeeId, period, achievedAmount, overrideBonus } = req.body;

  const employee = await User.findById(employeeId);
  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  // Find active slab for employee role
  // Assuming 'role' in Slab corresponds to 'level' in User (e.g. 'N1', 'N2') or 'role' (e.g. 'Manager')
  // We might need to adjust this matching logic.
  // The user model has 'level' (N0, N1, etc) and 'role' (employee, manager, etc).
  // The slab model has 'role' enum ['NE', 'N0', 'N1', 'N2', 'N3', 'Manager'].
  
  let roleForSlab = employee.level;
  if (!['N0', 'N1', 'N2', 'N3'].includes(roleForSlab)) {
      roleForSlab = 'Manager'; // Fallback or mapping
  }

  const slab = await Slab.findOne({ role: roleForSlab, isActive: true });
  
  if (!slab) {
    // If no slab found, maybe return error or calculate 0
    return res.status(400).json({ success: false, error: `No active slab found for role/level: ${roleForSlab}` });
  }

  // Target = Multiplier * Monthly CTC
  // slab.eligibilityTarget now stores the Multiplier (e.g. 5)
  const multiplier = slab.eligibilityTarget || 5; 
  const monthlySalary = (employee.salary && employee.salary.ctc) ? (employee.salary.ctc / 12) : 0;
  const target = monthlySalary * multiplier;
  
  // Prevent division by zero if salary is missing
  if (target === 0) {
      return res.status(400).json({ success: false, error: 'Employee salary not set or zero. Cannot calculate target.' });
  }

  const achievementPct = (achievedAmount / target) * 100;
  
  let incentiveAmount = 0;
  let esopAllocation = 0;

  // Calculation Logic
  // 1. Calculate base incentive on the Target Amount
  // 2. Calculate extra incentive on the amount EXCEEDING the target
  
  if (achievedAmount >= target) {
      // Base Incentive: Target * Base Percentage
      const baseIncentive = target * (slab.basePercentage / 100);
      
      // Above Target Incentive: (Achieved - Target) * Above Percentage
      const extraAmount = achievedAmount - target;
      const extraIncentive = extraAmount * (slab.abovePercentage / 100);
      
      incentiveAmount = baseIncentive + extraIncentive;
      
      // ESOP Allocation
      esopAllocation = incentiveAmount * (slab.esopPercentage / 100);
  }

  const cashPayout = incentiveAmount - esopAllocation;

  // Check if exists
  let incentive = await Incentive.findOne({ employeeId, period });

  const status = req.user.role === 'admin' ? 'Approved' : 'Pending';
  const approvedBy = req.user.role === 'admin' ? req.user._id : undefined;

  const payload = {
    employeeId,
    period,
    targetAmount: target,
    achievedAmount,
    achievementPercentage: achievementPct,
    incentiveAmount,
    cashPayout,
    esopAllocation,
    overrideBonus: overrideBonus || 0,
    status,
    calculatedBy: req.user._id,
    approvedBy
  };

  if (incentive) {
    incentive = await Incentive.findByIdAndUpdate(incentive._id, payload, { new: true });
  } else {
    incentive = await Incentive.create(payload);
  }

  res.status(200).json({ success: true, data: incentive });
});

// @desc    Get Incentives
// @route   GET /api/incentives
// @access  Private
exports.getIncentives = asyncHandler(async (req, res, next) => {
  let query = {};

  if (req.user.role === 'employee') {
    query.employeeId = req.user._id;
  } else if (req.user.role === 'manager') {
     // Show team? For now show all or restricted
     // Implementing simple team check if needed, or just own
     // Let's allow managers to see their own for now, or if they have team
     query.employeeId = req.user._id; 
  }
  // Admin/HR see all (filtered by query params if provided)
  if (req.query.employeeId && ['admin', 'hr'].includes(req.user.role)) {
      query.employeeId = req.query.employeeId;
  }
  if (req.query.period) {
      query.period = req.query.period;
  }

  const incentives = await Incentive.find(query)
    .populate('employeeId', 'fullName email employeeId')
    .populate('calculatedBy', 'fullName')
    .populate('approvedBy', 'fullName')
    .sort('-createdAt');

  res.status(200).json({ success: true, count: incentives.length, data: incentives });
});

// @desc    Approve Incentive
// @route   PUT /api/incentives/:id/approve
// @access  Private (Admin)
exports.approveIncentive = asyncHandler(async (req, res, next) => {
  let incentive = await Incentive.findById(req.params.id);

  if (!incentive) {
    return res.status(404).json({ success: false, error: 'Incentive not found' });
  }

  incentive.status = 'Approved';
  incentive.approvedBy = req.user._id;
  await incentive.save();

  res.status(200).json({ success: true, data: incentive });
});

// @desc    Get My Incentive Summary (Dashboard)
// @route   GET /api/incentives/my-summary
// @access  Private
exports.getMyIncentiveSummary = asyncHandler(async (req, res, next) => {
    // Get latest approved incentive or aggregate
    // Let's get the latest one for the dashboard view
    const latest = await Incentive.findOne({ employeeId: req.user._id }).sort('-createdAt');
    
    // Or maybe aggregate current quarter?
    // For simplicity, returning the most recent calculation
    
    if (!latest) {
        return res.status(200).json({ success: true, data: {} });
    }
    
    res.status(200).json({ success: true, data: latest });
});
