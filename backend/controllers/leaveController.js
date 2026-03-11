const Leave = require('../models/Leave');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const { sendCategorizedEmail, EmailType } = require('../utils/emailRouter');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = asyncHandler(async (req, res, next) => {
  // Ensure employeeId matches logged in user unless admin
  if (req.body.employeeId && req.body.employeeId !== req.user.id && req.user.role !== 'admin') {
     return res.status(401).json({ success: false, error: 'Not authorized to apply leave for others' });
  }
  
  if (!req.body.employeeId) req.body.employeeId = req.user.id;

  const leaveType = String(req.body.leaveType || '').trim();
  const fromDate = new Date(req.body.fromDate);
  const toDate = new Date(req.body.toDate);

  if (!leaveType) {
    return res.status(400).json({ success: false, error: 'Leave type is required' });
  }
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ success: false, error: 'Invalid leave dates' });
  }

  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (start.getTime() > end.getTime()) {
    return res.status(400).json({ success: false, error: 'From date cannot be after To date' });
  }

  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const addDaysByMonth = (m, s, e) => {
    const cur = new Date(s);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(e);
    last.setHours(0, 0, 0, 0);
    while (cur.getTime() <= last.getTime()) {
      const k = monthKey(cur);
      m.set(k, (m.get(k) || 0) + 1);
      cur.setDate(cur.getDate() + 1);
    }
  };

  const requestedDaysByMonth = new Map();
  addDaysByMonth(requestedDaysByMonth, start, end);

  const firstMonthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonthEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);
  lastMonthEnd.setHours(23, 59, 59, 999);

  const existingLeaves = await Leave.find({
    employeeId: req.body.employeeId,
    status: { $in: ['pending', 'approved'] },
    fromDate: { $lte: lastMonthEnd },
    toDate: { $gte: firstMonthStart }
  }).lean();

  const usedTotalByMonth = new Map();
  const usedCasualByMonth = new Map();
  for (const l of existingLeaves) {
    const ls = new Date(l.fromDate);
    const le = new Date(l.toDate);
    if (Number.isNaN(ls.getTime()) || Number.isNaN(le.getTime())) continue;
    ls.setHours(0, 0, 0, 0);
    le.setHours(0, 0, 0, 0);
    const cur = new Date(ls);
    while (cur.getTime() <= le.getTime()) {
      const k = monthKey(cur);
      usedTotalByMonth.set(k, (usedTotalByMonth.get(k) || 0) + 1);
      if (String(l.leaveType) === 'Casual Leave') {
        usedCasualByMonth.set(k, (usedCasualByMonth.get(k) || 0) + 1);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  for (const [k, days] of requestedDaysByMonth.entries()) {
    const totalUsed = usedTotalByMonth.get(k) || 0;
    if (totalUsed + days > 3) {
      return res.status(400).json({ success: false, error: 'Monthly leave limit exceeded (max 3 days)' });
    }
    if (leaveType === 'Casual Leave') {
      const casualUsed = usedCasualByMonth.get(k) || 0;
      if (casualUsed + days > 2) {
        return res.status(400).json({ success: false, error: 'Optional leave limit exceeded (max 2 days per month)' });
      }
    }
  }

  const leave = await Leave.create(req.body);

  // Notify Reporting Manager
  const employee = await User.findById(req.user.id).populate('reportingManagerId');
  if (employee && employee.reportingManagerId) {
    const manager = employee.reportingManagerId;
    const html = `
      <p>Hello ${manager.fullName},</p>
      <p>${employee.fullName} has applied for ${leave.leaveType} from ${new Date(leave.fromDate).toDateString()} to ${new Date(leave.toDate).toDateString()}.</p>
      <p>Reason: ${leave.reason}</p>
      <p>Please login to approve/reject.</p>
    `;
    try {
      await sendCategorizedEmail(manager, EmailType.OPERATIONAL, {
        subject: `Leave Request - ${employee.fullName}`,
        html,
        text: `Leave Request from ${employee.fullName}`
      });
    } catch (err) {
      console.error('Email send failed', err);
    }
  }

  res.status(201).json({ success: true, data: leave });
});

// @desc    Get leaves
// @route   GET /api/leaves
// @access  Private
exports.getLeaves = asyncHandler(async (req, res, next) => {
  let query = {};

  const isManager = req.user.role === 'manager' || ['N1', 'N2', 'N3', 'PnL'].includes(req.user.level);

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    // Admin/HR see all
    if (req.query.employeeId) {
      query = { employeeId: req.query.employeeId };
    }
  } else if (isManager) {
    // PnL or Managers
    // Find all users in the Team (if PnL) OR recursive reportees
    
    let teamIds = [];

    // If PnL, find team members
    const team = await require('../models/Team').findOne({ pnlHeadId: req.user._id });
    if (team) {
       const teamMembers = await User.find({ teamId: team._id }).select('_id');
       teamIds = teamMembers.map(u => u._id);
    }

    // Also get recursive reportees (for N3/N2/N1 who might not have a Team entity but have reportees)
    const getDescendants = async (managerId) => {
      const subordinates = await User.find({ reportingManagerId: managerId }).select('_id');
      let allIds = subordinates.map(s => s._id);
      for (const sub of subordinates) {
        const subDescendants = await getDescendants(sub._id);
        allIds = [...allIds, ...subDescendants];
      }
      return allIds;
    };
    const descendantIds = await getDescendants(req.user._id);
    
    // Merge
    const allAccessibleIds = [...new Set([...teamIds.map(id => id.toString()), ...descendantIds.map(id => id.toString()), req.user._id.toString()])];

    if (req.query.employeeId) {
       if (!allAccessibleIds.includes(req.query.employeeId)) {
         return res.status(401).json({ success: false, error: 'Not authorized' });
       }
       query = { employeeId: req.query.employeeId };
    } else {
       query = { employeeId: { $in: allAccessibleIds } };
    }
  } else {
    // Regular employee sees only own leaves
    query = { employeeId: req.user._id };
  }

  const leaves = await Leave.find(query)
    .populate('employeeId', 'fullName email')
    .populate('approvedBy', 'fullName')
    .sort('-createdAt')
    .lean();
    
  res.status(200).json({ success: true, count: leaves.length, data: leaves });
});

// @desc    Update leave status
// @route   PUT /api/leaves/:id
// @access  Private (Admin/Manager)
exports.updateLeaveStatus = asyncHandler(async (req, res, next) => {
  let leave = await Leave.findById(req.params.id).populate('employeeId');

  if (!leave) {
    return res.status(404).json({ success: false, error: 'Leave request not found' });
  }

  if (req.user.role !== 'admin') {
    return res.status(401).json({ success: false, error: 'Only Admin can approve leaves' });
  }

  leave = await Leave.findByIdAndUpdate(req.params.id, {  
    status: req.body.status,
    approvedBy: req.user._id,
    approvedAt: Date.now(),
    rejectionReason: req.body.rejectionReason
  }, { 
    new: true,
    runValidators: true 
  }).populate('employeeId').populate('approvedBy', 'fullName');

  // Notify Employee
  const applicant = leave.employeeId;
  const html = `
    <p>Hello ${applicant.fullName},</p>
    <p>Your leave request for ${new Date(leave.fromDate).toDateString()} has been <b>${leave.status.toUpperCase()}</b> by ${req.user.fullName}.</p>
    ${leave.status === 'rejected' && leave.rejectionReason ? `<p>Reason: ${leave.rejectionReason}</p>` : ''}
  `;

  try {
    await sendCategorizedEmail(applicant, EmailType.OPERATIONAL, {
      subject: `Leave Request ${leave.status.toUpperCase()}`,
      html,
      text: `Your leave request has been ${leave.status}`
    });
  } catch (err) { console.error(err); }

  res.status(200).json({ success: true, data: leave });
});
