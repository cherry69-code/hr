const Leave = require('../models/Leave');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const sendEmail = require('../utils/sendEmail');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = asyncHandler(async (req, res, next) => {
  // Ensure employeeId matches logged in user unless admin
  if (req.body.employeeId && req.body.employeeId !== req.user.id && req.user.role !== 'admin') {
     return res.status(401).json({ success: false, error: 'Not authorized to apply leave for others' });
  }
  
  if (!req.body.employeeId) req.body.employeeId = req.user.id;

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
      await sendEmail({
        to: manager.email,
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

  if (req.user.role === 'admin' || req.user.role === 'hr') {
    // Admin/HR see all
    if (req.query.employeeId) {
      query = { employeeId: req.query.employeeId };
    }
  } else if (req.user.role === 'manager') {
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

  // Check authorization
  // PnL and Admin can always approve
  const isSuperApprover = req.user.role === 'admin' || req.user.level === 'PnL';
  
  if (isSuperApprover) {
    // Approved
  } else {
    // Other managers cannot approve leave as per new requirement
    return res.status(401).json({ success: false, error: 'Only PnL or Admin can approve leaves' });
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
    await sendEmail({
      to: applicant.email,
      subject: `Leave Request ${leave.status.toUpperCase()}`,
      html,
      text: `Your leave request has been ${leave.status}`
    });
  } catch (err) { console.error(err); }

  res.status(200).json({ success: true, data: leave });
});
