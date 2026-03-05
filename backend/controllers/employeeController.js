const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const sendEmail = require('../utils/sendEmail');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private/Admin/HR/Manager
exports.getEmployees = asyncHandler(async (req, res, next) => {
  let query = {};
  
  // If manager (PnL, N3, N2, N1), see all reportees (recursive or team-based)
  if (req.user.role === 'manager') {
    // If PnL, they can see everyone in their assigned team OR just everyone under hierarchy
    if (req.user.level === 'PnL') {
      // Find team where this PnL is head
      // const team = await Team.findOne({ pnlHeadId: req.user._id });
      // If team exists, find all users in that team?
      // For now, let's stick to recursive hierarchy or teamId if set.
      
      // If user has a teamId, show all users in that team
      const team = await require('../models/Team').findOne({ pnlHeadId: req.user._id });
      if (team) {
         query = { teamId: team._id };
      } else {
         // Fallback to recursive hierarchy
         query = { reportingManagerId: req.user._id }; 
         // NOTE: This is simplified. Real-world PnL needs to see deep structure.
      }
    } else {
       // N3, N2, N1 -> see direct reportees or recursive?
       // Let's stick to direct reportees for list view to keep it simple, 
       // or user can implement recursive fetch.
       query = { reportingManagerId: req.user._id };
    }
  } else if (req.user.role === 'employee') {
    // Regular employees shouldn't see everyone usually, but current access allows HR/Admin.
    // We'll keep it restricted to Admin/HR as per original annotation, but let's see route config.
  }

  const employees = await User.find(query)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .lean();
    
  res.status(200).json({ success: true, count: employees.length, data: employees });
});

// @desc    Get potential managers (N1, N2, N3, PnL)
// @route   GET /api/employees/managers
// @access  Private/Admin/HR
exports.getManagers = asyncHandler(async (req, res, next) => {
  const managers = await User.find({ 
    role: { $in: ['manager', 'admin'] } 
  }).select('fullName email level designation').lean();
  
  res.status(200).json({ success: true, count: managers.length, data: managers });
});

// @desc    Create employee
// @route   POST /api/employees
// @access  Private/Admin
exports.createEmployee = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, role, ...hrData } = req.body;

  // Prevent HR from creating Admins
  if (req.user.role === 'hr' && role === 'admin') {
    return res.status(403).json({ success: false, error: 'HR cannot create Admin users' });
  }

  const tempPassword = password || Math.random().toString(36).slice(-10);

  const employee = await User.create({
    fullName,
    email,
    password: tempPassword,
    role: role || 'employee',
    status: 'DOCUMENT_PENDING',
    ...hrData
  });

  const resetToken = employee.getResetPasswordToken();
  await employee.save({ validateBeforeSave: false });

  const frontendUrl = process.env.FRONTEND_URL || 'https://www.hrpropninja.com';
  const resetUrl = `${frontendUrl}/auth/reset-password/${resetToken}`;

  const html = `
    <div>
      <p>Hello ${employee.fullName},</p>
      <p>Your PropNinja HR account has been created.</p>
      <p>Set your password using this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 10 minutes.</p>
    </div>
  `;

  await sendEmail({
    to: employee.email,
    subject: 'PropNinja HR - Set Your Password',
    html,
    text: `Set your password: ${resetUrl}`
  });

  res.status(201).json({ success: true, data: employee });
});

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = asyncHandler(async (req, res, next) => {
  const employee = await User.findById(req.params.id)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .populate('teamId', 'name description')
    .lean();

  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  // Fetch Team Members if user is part of a team
  let teamMembers = [];
  if (employee.teamId) {
    teamMembers = await User.find({ 
      teamId: employee.teamId._id,
      _id: { $ne: employee._id } // Exclude self
    })
    .select('fullName designation profilePicture')
    .lean();
  }

  // Fetch Reporting Line (Managers)
  // For now, just the direct manager is populated.
  // If we want a chain, we'd need recursive lookup, but UI usually shows direct manager.

  res.status(200).json({ success: true, data: { ...employee, teamMembers } });
});

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private/Admin/HR
exports.updateEmployee = asyncHandler(async (req, res, next) => {
  const employee = await User.findById(req.params.id).select('+password');
  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  // Prevent HR from changing roles to Admin or deleting sensitive fields if needed
  if (req.user.role === 'hr' && req.body.role === 'admin') {
     return res.status(401).json({ success: false, error: 'HR cannot promote users to Admin' });
  }

  const updates = { ...req.body };
  
  // Handle nested updates for personalDetails and documents if sent partially
  if (updates.personalDetails) {
    employee.personalDetails = { ...employee.personalDetails, ...updates.personalDetails };
    delete updates.personalDetails;
  }
  if (updates.documents) {
    employee.documents = { ...employee.documents, ...updates.documents };
    delete updates.documents;
  }

  Object.keys(updates).forEach((key) => {
    employee[key] = updates[key];
  });

  await employee.save();

  const safeEmployee = await User.findById(employee._id)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .populate('teamId', 'name')
    .lean();
    
  res.status(200).json({ success: true, data: safeEmployee });
});

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private/Admin
exports.deleteEmployee = asyncHandler(async (req, res, next) => {
  const employee = await User.findByIdAndDelete(req.params.id);
  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }
  res.status(200).json({ success: true, data: {} });
});

// @desc    Send Offer/Joining Letter
// @route   POST /api/employees/:id/send-letter
// @access  Private/HR/Admin
exports.sendLetter = asyncHandler(async (req, res, next) => {
  const employee = await User.findById(req.params.id);
  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  const { type, letterContent } = req.body; // type: 'offer_letter' or 'joining_letter'

  if (!type || !letterContent) {
    return res.status(400).json({ success: false, error: 'Please provide letter type and content' });
  }

  const subject = type === 'offer_letter' ? 'Offer Letter - PropNinja' : 'Joining Letter - PropNinja';
  
  // Here we would ideally generate a PDF or link to a signable document
  // For now, we assume letterContent is HTML or a link
  
  const html = `
    <p>Dear ${employee.fullName},</p>
    <p>Please find your ${type.replace('_', ' ')} below:</p>
    <div style="border: 1px solid #ccc; padding: 20px; background: #f9f9f9;">
      ${letterContent}
    </div>
    <p>Regards,<br>HR Team</p>
  `;

  await sendEmail({
    to: employee.email,
    subject,
    html,
    text: `Please check your email for ${type}`
  });

  res.status(200).json({ success: true, message: 'Letter sent successfully' });
});

module.exports = {
  getEmployees: exports.getEmployees,
  getManagers: exports.getManagers,
  createEmployee: exports.createEmployee,
  getEmployee: exports.getEmployee,
  updateEmployee: exports.updateEmployee,
  deleteEmployee: exports.deleteEmployee,
  sendLetter: exports.sendLetter
};
