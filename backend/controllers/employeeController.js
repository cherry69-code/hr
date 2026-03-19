const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const sendEmail = require('../utils/sendEmail');
const cloudinary = require('../config/cloudinary');

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

  if (req.query.teamId) {
    const teamId = String(req.query.teamId || '').trim();
    if (teamId.match(/^[0-9a-fA-F]{24}$/)) {
      query.teamId = teamId;
    }
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100; // Default 100 to avoid breaking UI immediately
  const startIndex = (page - 1) * limit;

  const total = await User.countDocuments(query);

  const employees = await User.find(query)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .populate('teamId', 'name')
    .sort({ createdAt: -1 }) // Sort by newest
    .skip(startIndex)
    .limit(limit)
    .lean();
    
  res.status(200).json({ 
      success: true, 
      count: employees.length, 
      total,
      pagination: {
          page,
          limit,
          pages: Math.ceil(total / limit)
      },
      data: employees 
  });
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
  const { fullName, email, password, role, employeeId, ...hrData } = req.body;

  const employeeCode = String(employeeId || '').trim();
  if (!employeeCode) {
    return res.status(400).json({ success: false, error: 'Employee code is required' });
  }

  const existingCode = await User.findOne({ employeeId: employeeCode }).select('_id').lean();
  if (existingCode) {
    return res.status(400).json({ success: false, error: 'Employee code already exists' });
  }

  // Prevent HR from creating Admins
  if (req.user.role === 'hr' && role === 'admin') {
    return res.status(403).json({ success: false, error: 'HR cannot create Admin users' });
  }

  const tempPassword = password || Math.random().toString(36).slice(-10);

  const employee = await User.create({
    fullName,
    email,
    password: tempPassword,
    employeeId: employeeCode,
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
  const requestedId = String(req.params.id || '');
  const requesterId = String(req.user?._id || req.user?.id || '');

  if (!requestedId) {
    return res.status(400).json({ success: false, error: 'Employee ID is required' });
  }

  if (req.user.role === 'employee' && requesterId !== requestedId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  if (req.user.role === 'manager' && requesterId !== requestedId) {
    const reportees = await User.aggregate([
      { $match: { _id: req.user._id } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'reportingManagerId',
          as: 'desc'
        }
      },
      { $project: { ids: { $concatArrays: [['$_id'], '$desc._id'] } } }
    ]);
    const allowed = new Set((reportees[0]?.ids || []).map((x) => String(x)));
    if (!allowed.has(requestedId)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
  }

  const employee = await User.findById(requestedId)
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

  const data = { ...employee, teamMembers };
  if (!['admin', 'hr'].includes(req.user.role)) {
    if (data.salary) delete data.salary;
    if (data.bankDetails) delete data.bankDetails;
    if (data.personalDetails) {
      const pd = { ...data.personalDetails };
      if (pd.panNumber) pd.panNumber = '************';
      if (pd.aadharNumber) pd.aadharNumber = '************';
      data.personalDetails = pd;
    }
  } else {
    try {
      const { decryptField } = require('../utils/fieldCrypto');
      if (data.personalDetails) {
        if (data.personalDetails.panNumber) data.personalDetails.panNumber = decryptField(data.personalDetails.panNumber);
        if (data.personalDetails.aadharNumber) data.personalDetails.aadharNumber = decryptField(data.personalDetails.aadharNumber);
      }
      if (data.bankDetails) {
        if (data.bankDetails.accountNumber) data.bankDetails.accountNumber = decryptField(data.bankDetails.accountNumber);
        if (data.bankDetails.ifscCode) data.bankDetails.ifscCode = decryptField(data.bankDetails.ifscCode);
        if (data.bankDetails.bankName) data.bankDetails.bankName = decryptField(data.bankDetails.bankName);
      }
      if (data.salary) {
        const s = { ...data.salary };
        Object.keys(s).forEach((k) => {
          if (s[k]) s[k] = Number(decryptField(s[k]) || 0);
        });
        data.salary = s;
      }
    } catch {}
  }

  res.status(200).json({ success: true, data });
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

  if (updates.employeeId !== undefined) {
    const employeeCode = String(updates.employeeId || '').trim();
    if (!employeeCode) {
      return res.status(400).json({ success: false, error: 'Employee code is required' });
    }
    const existingCode = await User.findOne({ employeeId: employeeCode, _id: { $ne: employee._id } }).select('_id').lean();
    if (existingCode) {
      return res.status(400).json({ success: false, error: 'Employee code already exists' });
    }
    updates.employeeId = employeeCode;
  }
  
  const cleanObject = (obj) => {
    Object.keys(obj).forEach(key => {
      if (obj[key] === undefined || obj[key] === null || obj[key] === '' || obj[key] === 'undefined') {
        delete obj[key];
      }
    });
    return obj;
  };
  
  if (updates.personalDetails) {
    if (typeof updates.personalDetails === 'object' && !Array.isArray(updates.personalDetails)) {
      const cleanDetails = cleanObject({ ...updates.personalDetails });
      if (Object.keys(cleanDetails).length > 0) {
        Object.keys(cleanDetails).forEach(k => {
          if (!employee.personalDetails) employee.personalDetails = {};
          employee.personalDetails[k] = cleanDetails[k];
        });
      }
    }
    delete updates.personalDetails;
  }

  if (updates.documents) {
    if (typeof updates.documents === 'object' && !Array.isArray(updates.documents)) {
      const cleanDocs = cleanObject({ ...updates.documents });
      if (Object.keys(cleanDocs).length > 0) {
        Object.keys(cleanDocs).forEach(k => {
          const val = cleanDocs[k];
          if (val === undefined || val === null || val === '' || val === 'undefined') return;
          if (typeof val !== 'object' || Array.isArray(val)) return;
          const cleanedVal = cleanObject({ ...val });
          if (Object.keys(cleanedVal).length === 0) return;
          if (!employee.documents) employee.documents = {};
          employee.documents[k] = cleanedVal;
        });
      }
    }
    delete updates.documents;
  }

  const password = updates.password;
  delete updates.password;

  Object.keys(updates).forEach((key) => {
    if (updates[key] !== undefined && updates[key] !== 'undefined') {
        employee[key] = updates[key];
    }
  });

  if (password) {
    employee.password = password;
  }
  
  await employee.save();

  const safeEmployee = await User.findById(employee._id)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .populate('teamId', 'name')
    .lean();
    
  res.status(200).json({ success: true, data: safeEmployee });
});

// @desc    Manually activate employee (after manual document uploads)
// @route   POST /api/employees/:id/activate
// @access  Private/Admin/HR
exports.activateEmployee = asyncHandler(async (req, res) => {
  const id = String(req.params.id || '');
  if (!id) return res.status(400).json({ success: false, error: 'Employee ID is required' });

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ success: false, error: 'Employee not found' });

  if (!user.joiningDate || Number.isNaN(new Date(user.joiningDate).getTime())) {
    return res.status(400).json({ success: false, error: 'Joining date is required before activation' });
  }

  const offer = user.documents?.offerLetter;
  const join = user.documents?.joiningLetter;
  const hasOffer = Boolean(offer && (offer.publicId || offer.url));
  const hasJoiningLetter = Boolean(join && (join.publicId || join.url));

  if (!hasOffer || !hasJoiningLetter) {
    return res.status(400).json({
      success: false,
      error: 'Offer letter and joining letter must be uploaded before activation'
    });
  }

  user.status = 'active';
  await user.save();

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const loginUrl = `${frontendUrl}/login`;
  try {
    await sendEmail({
      to: user.email,
      subject: 'Welcome to PropNinja - Account Activated',
      html: `
        <p>Congratulations! Your onboarding is complete.</p>
        <p>Your account is now ACTIVE.</p>
        <p>Login here: <a href="${loginUrl}">${loginUrl}</a></p>
        <p>Email: ${user.email}</p>
      `
    });
  } catch {}

  const safeEmployee = await User.findById(user._id)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .populate('teamId', 'name')
    .lean();

  return res.status(200).json({ success: true, data: safeEmployee });
});

// @desc    Update profile picture (Self or Admin/HR)
// @route   PUT /api/employees/:id/profile-picture
// @access  Private
exports.updateProfilePicture = asyncHandler(async (req, res) => {
  const targetId = String(req.params.id || '');
  const requesterId = String(req.user.id || '');
  const role = String(req.user.role || '');

  if (!targetId) {
    return res.status(400).json({ success: false, error: 'Employee ID is required' });
  }

  if (requesterId !== targetId && role !== 'admin' && role !== 'hr') {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { file } = req.body || {};
  if (!file) {
    return res.status(400).json({ success: false, error: 'Profile image is required' });
  }

  const employee = await User.findById(targetId);
  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  let uploadedUrl = '';
  try {
    const result = await cloudinary.uploader.upload(file, {
      folder: 'profile_pictures',
      resource_type: 'image',
      public_id: `${employee.employeeId || employee._id}_${Date.now()}`
    });
    uploadedUrl = result.secure_url;
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Image upload failed' });
  }

  employee.profilePicture = uploadedUrl;
  if (!employee.documents) employee.documents = {};
  employee.documents.photo = { url: uploadedUrl, uploadedAt: Date.now() };
  await employee.save();

  const safeEmployee = await User.findById(employee._id)
    .populate('departmentId')
    .populate('reportingManagerId', 'fullName email')
    .populate('teamId', 'name')
    .lean();

  return res.status(200).json({ success: true, data: safeEmployee });
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

const { sendOfferLetterToCandidate, sendJoiningAgreementToCandidate } = require('./documentController');

// @desc    Send Offer/Joining Letter (Proxy to Document Controller)
// @route   POST /api/employees/:id/send-letter
// @access  Private/HR/Admin
exports.sendLetter = asyncHandler(async (req, res, next) => {
  const { type } = req.body;
  
  // Inject employeeId into body so documentController can find the user
  req.body.employeeId = req.params.id;
  
  if (type === 'offer_letter') {
      return sendOfferLetterToCandidate(req, res, next);
  } else if (type === 'joining_letter' || type === 'joining_agreement') {
      return sendJoiningAgreementToCandidate(req, res, next);
  }
  
  res.status(400).json({ success: false, error: 'Invalid letter type' });
});

module.exports = {
  getEmployees: exports.getEmployees,
  getManagers: exports.getManagers,
  createEmployee: exports.createEmployee,
  getEmployee: exports.getEmployee,
  updateEmployee: exports.updateEmployee,
  activateEmployee: exports.activateEmployee,
  updateProfilePicture: exports.updateProfilePicture,
  deleteEmployee: exports.deleteEmployee,
  sendLetter: exports.sendLetter
};
