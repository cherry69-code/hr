const SalesRevenue = require('../models/SalesRevenue');
const IncentiveCalculation = require('../models/IncentiveCalculation');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const { invalidateLeaderboardCache } = require('./leaderboardController');
const { getLevelRule } = require('../utils/salesLevelRules');

const toNumber = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const getMonthRange = (month, year) => {
  const start = new Date(Number(year), Number(month) - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
  return { start, end };
};

const computeIncentive = ({ level, baseSalary, eligibleRevenue }) => {
  const rule = getLevelRule(level);
  const target = toNumber(baseSalary) * rule.multiplier;
  const revenue = toNumber(eligibleRevenue);

  const revenueTillTarget = Math.min(revenue, target);
  const revenueAboveTarget = Math.max(0, revenue - target);

  const baseIncentive = revenueTillTarget * rule.basePct;
  const aboveTargetIncentive = revenueAboveTarget * rule.abovePct;
  const total = baseIncentive + aboveTargetIncentive;

  const cash = total * 0.8;
  const esop = total * 0.2;

  return {
    targetRevenue: target,
    baseIncentive,
    aboveTargetIncentive,
    totalIncentive: total,
    cashComponent: cash,
    esopComponent: esop
  };
};

// Revenue Entry
exports.createRevenue = asyncHandler(async (req, res) => {
  const { employeeId, clientName, projectName, revenueAmount, invoiceRaised, paymentCollected, bookingDate, invoiceUrl } =
    req.body || {};

  if (!employeeId || !bookingDate || !clientName || !projectName) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const rev = await SalesRevenue.create({
    employeeId,
    clientName,
    projectName,
    revenueAmount: toNumber(revenueAmount),
    invoiceRaised: Boolean(invoiceRaised),
    paymentCollected: Boolean(paymentCollected),
    bookingDate: new Date(bookingDate),
    invoiceUrl: invoiceUrl || '',
    createdBy: req.user._id
  });

  try {
    invalidateLeaderboardCache();
  } catch {}

  return res.status(201).json({ success: true, data: rev });
});

exports.getRevenue = asyncHandler(async (req, res) => {
  const query = {};

  const employeeIdParam = req.query.employeeId ? String(req.query.employeeId) : '';
  if (employeeIdParam) query.employeeId = employeeIdParam;
  if (req.user.role === 'employee') query.employeeId = req.user._id;
  if (req.user.role === 'manager') {
    const reportees = await User.find({ reportingManagerId: req.user._id }).select('_id').lean();
    const allowed = new Set([String(req.user._id), ...reportees.map((r) => String(r._id))]);
    if (employeeIdParam) {
      if (!allowed.has(employeeIdParam)) {
        return res.status(403).json({ success: false, error: 'Not authorized' });
      }
    } else {
      query.employeeId = { $in: Array.from(allowed) };
    }
  }

  if (req.query.month && req.query.year) {
    const { start, end } = getMonthRange(req.query.month, req.query.year);
    query.bookingDate = { $gte: start, $lte: end };
  }

  if (req.query.projectName) query.projectName = new RegExp(String(req.query.projectName), 'i');
  if (req.query.clientName) query.clientName = new RegExp(String(req.query.clientName), 'i');

  const items = await SalesRevenue.find(query)
    .populate('employeeId', 'fullName employeeId level')
    .sort('-bookingDate')
    .limit(500)
    .lean();

  return res.status(200).json({ success: true, count: items.length, data: items });
});

exports.deleteRevenue = asyncHandler(async (req, res) => {
  const item = await SalesRevenue.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'Revenue entry not found' });
  try {
    invalidateLeaderboardCache();
  } catch {}
  return res.status(200).json({ success: true, data: {} });
});

// Monthly Calculation
exports.calculateMonthly = asyncHandler(async (req, res) => {
  const month = Number(req.body?.month);
  const year = Number(req.body?.year);
  if (!month || month < 1 || month > 12 || !year) {
    return res.status(400).json({ success: false, error: 'Please provide valid month and year' });
  }

  const { start, end } = getMonthRange(month, year);

  const employees = await User.find({ level: { $in: ['NE', 'N0', 'N1', 'N2', 'N3'] } })
    .select('fullName employeeId level salary reportingManagerId')
    .lean();

  const employeeIds = employees.map((e) => e._id);

  const revenue = await SalesRevenue.find({
    employeeId: { $in: employeeIds },
    bookingDate: { $gte: start, $lte: end }
  })
    .select('employeeId revenueAmount invoiceRaised paymentCollected')
    .lean();

  const revenueByEmp = new Map();
  for (const r of revenue) {
    const key = String(r.employeeId);
    if (!revenueByEmp.has(key)) revenueByEmp.set(key, []);
    revenueByEmp.get(key).push(r);
  }

  const directReports = new Map();
  for (const emp of employees) {
    if (!emp.reportingManagerId) continue;
    const mgr = String(emp.reportingManagerId);
    if (!directReports.has(mgr)) directReports.set(mgr, []);
    directReports.get(mgr).push(String(emp._id));
  }

  const collectDescendants = (rootId) => {
    const seen = new Set();
    const queue = [String(rootId)];
    while (queue.length) {
      const cur = queue.shift();
      const children = directReports.get(cur) || [];
      for (const child of children) {
        if (seen.has(child)) continue;
        seen.add(child);
        queue.push(child);
      }
    }
    return Array.from(seen);
  };

  const results = [];

  for (const emp of employees) {
    const baseSalary = Number(emp?.salary?.ctc ? emp.salary.ctc / 12 : 0);
    const selfId = String(emp._id);
    let revenueEmpIds = [selfId];
    if (String(emp.level) === 'N2') {
      revenueEmpIds = [selfId, ...(directReports.get(selfId) || [])];
    }
    if (String(emp.level) === 'N3') {
      revenueEmpIds = [selfId, ...collectDescendants(selfId)];
    }

    const list = revenueEmpIds.flatMap((id) => revenueByEmp.get(id) || []);
    const totalRevenue = list.reduce((sum, r) => sum + toNumber(r.revenueAmount), 0);
    const eligibleRecords = list.filter((r) => r.invoiceRaised && r.paymentCollected);
    const eligibleRevenue = eligibleRecords.reduce((sum, r) => sum + toNumber(r.revenueAmount), 0);
    const hasPendingCollection = list.some((r) => !(r.invoiceRaised && r.paymentCollected));

    const calcCore = computeIncentive({
      level: String(emp.level),
      baseSalary,
      eligibleRevenue: hasPendingCollection ? 0 : eligibleRevenue
    });

    const status = hasPendingCollection ? 'Pending Collection' : 'Pending';

    const payload = {
      employeeId: emp._id,
      month,
      year,
      totalRevenue,
      eligibleRevenue: hasPendingCollection ? 0 : eligibleRevenue,
      targetRevenue: calcCore.targetRevenue,
      baseIncentive: calcCore.baseIncentive,
      aboveTargetIncentive: calcCore.aboveTargetIncentive,
      teamOverrideBonus: 0,
      totalIncentive: calcCore.totalIncentive,
      cashComponent: calcCore.cashComponent,
      esopComponent: calcCore.esopComponent,
      status,
      calculatedAt: new Date(),
      calculatedBy: req.user._id
    };

    const doc = await IncentiveCalculation.findOneAndUpdate(
      { employeeId: emp._id, month, year },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    results.push(doc);
  }

  try {
    invalidateLeaderboardCache();
  } catch {}

  // Team override (N1 managers): 10% of team members incentives
  const calculations = await IncentiveCalculation.find({ month, year })
    .select('employeeId totalIncentive status')
    .lean();

  const calcByEmp = new Map(calculations.map((c) => [String(c.employeeId), c]));
  const teamMap = new Map();
  for (const emp of employees) {
    if (emp.reportingManagerId) {
      const mgr = String(emp.reportingManagerId);
      if (!teamMap.has(mgr)) teamMap.set(mgr, []);
      teamMap.get(mgr).push(String(emp._id));
    }
  }

  for (const emp of employees) {
    if (String(emp.level) !== 'N1') continue;
    const teamMembers = teamMap.get(String(emp._id)) || [];
    if (!teamMembers.length) continue;

    let teamIncentiveTotal = 0;
    for (const memberId of teamMembers) {
      const c = calcByEmp.get(memberId);
      if (!c) continue;
      if (c.status === 'Pending Collection') continue;
      teamIncentiveTotal += toNumber(c.totalIncentive);
    }
    const override = teamIncentiveTotal * 0.1;

    const selfCalc = calcByEmp.get(String(emp._id));
    if (!selfCalc) continue;
    if (selfCalc.status === 'Pending Collection') continue;

    const newTotal = toNumber(selfCalc.totalIncentive) + override;
    const newCash = newTotal * 0.8;
    const newEsop = newTotal * 0.2;

    await IncentiveCalculation.findOneAndUpdate(
      { employeeId: emp._id, month, year },
      {
        $set: {
          teamOverrideBonus: override,
          totalIncentive: newTotal,
          cashComponent: newCash,
          esopComponent: newEsop
        }
      }
    );
  }

  return res.status(200).json({ success: true, count: results.length, data: results });
});

exports.getCalculations = asyncHandler(async (req, res) => {
  const query = {};

  if (req.user.role === 'employee') {
    query.employeeId = req.user._id;
  } else if (req.user.role === 'manager') {
    const reportees = await User.find({ reportingManagerId: req.user._id }).select('_id').lean();
    const allowed = new Set([String(req.user._id), ...reportees.map((r) => String(r._id))]);
    if (req.query.employeeId) {
      const requested = String(req.query.employeeId);
      if (!allowed.has(requested)) {
        return res.status(403).json({ success: false, error: 'Not authorized' });
      }
      query.employeeId = requested;
    } else {
      query.employeeId = { $in: Array.from(allowed) };
    }
  }

  if (req.query.employeeId && ['admin', 'hr'].includes(req.user.role)) {
    query.employeeId = String(req.query.employeeId);
  }
  if (req.query.month) query.month = Number(req.query.month);
  if (req.query.year) query.year = Number(req.query.year);
  if (req.query.status) query.status = String(req.query.status);

  const items = await IncentiveCalculation.find(query)
    .populate('employeeId', 'fullName employeeId level')
    .sort({ year: -1, month: -1, updatedAt: -1 })
    .limit(500)
    .lean();

  return res.status(200).json({ success: true, count: items.length, data: items });
});

exports.approveCalculation = asyncHandler(async (req, res) => {
  const calc = await IncentiveCalculation.findById(req.params.id);
  if (!calc) return res.status(404).json({ success: false, error: 'Incentive not found' });
  if (calc.status === 'Pending Collection') {
    return res.status(400).json({ success: false, error: 'Cannot approve while pending collection' });
  }
  calc.status = 'Approved';
  calc.approvedAt = new Date();
  calc.approvedBy = req.user._id;
  await calc.save();
  return res.status(200).json({ success: true, data: calc });
});

const quarterMonths = (q) => {
  if (q === 1) return [1, 2, 3];
  if (q === 2) return [4, 5, 6];
  if (q === 3) return [7, 8, 9];
  if (q === 4) return [10, 11, 12];
  return [];
};

exports.payQuarter = asyncHandler(async (req, res) => {
  const year = Number(req.body?.year);
  const quarter = Number(req.body?.quarter);
  if (!year || !quarter || quarter < 1 || quarter > 4) {
    return res.status(400).json({ success: false, error: 'Please provide valid year and quarter (1-4)' });
  }
  const months = quarterMonths(quarter);
  const filter = { year, month: { $in: months }, status: 'Approved' };

  const result = await IncentiveCalculation.updateMany(filter, {
    $set: { status: 'Paid', paidAt: new Date(), paidBy: req.user._id }
  });

  return res.status(200).json({ success: true, data: { matched: result.matchedCount || 0, modified: result.modifiedCount || 0 } });
});

exports.getMySummary = asyncHandler(async (req, res) => {
  const latest = await IncentiveCalculation.findOne({ employeeId: req.user._id })
    .sort({ year: -1, month: -1, updatedAt: -1 })
    .lean();
  return res.status(200).json({ success: true, data: latest || {} });
});
