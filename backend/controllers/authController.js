const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const ms = (v) => v * 1000;

const setCookie = (res, name, value, opts = {}) => {
  const isProd = String(process.env.NODE_ENV).toLowerCase() === 'production';
  res.cookie(name, value, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    ...opts
  });
};

const createAccessToken = (user) =>
  require('jsonwebtoken').sign(
    { id: user._id, role: user.role, level: user.level, companyId: user.companyId || undefined },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

const createRefreshToken = (user, tokenId) =>
  require('jsonwebtoken').sign(
    { id: user._id, tid: tokenId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, role, ...rest } = req.body;

  const user = await User.create({
    fullName,
    email,
    password,
    role,
    ...rest
  });

  const token = createAccessToken(user);
  const tid = crypto.randomBytes(16).toString('hex');
  const refresh = createRefreshToken(user, tid);
  user.refreshTokenHash = hash(tid);
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  setCookie(res, 'accessToken', token, { maxAge: 15 * 60 * 1000 });
  setCookie(res, 'refreshToken', refresh, { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });

  res.status(201).json({
    success: true,
    token,
    user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
  });
});

// @desc    Login user (Email or Employee Code)
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password, employeeCode } = req.body;
  const MAX_ATTEMPTS = 5;
  const LOCK_MS = 15 * 60 * 1000;

  if (!password) {
    return res.status(400).json({ success: false, error: 'Please provide password' });
  }

  // Determine login type: Employee Code or Email
  let user = null;
  
  if (employeeCode) {
    user = await User.findOne({ employeeId: employeeCode }).select('+password'); // Using employeeId as Employee Code
  } else if (email) {
    user = await User.findOne({ email }).select('+password');
  } else {
    return res.status(400).json({ success: false, error: 'Please provide Email or Employee Code' });
  }

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  if (user.lockUntil && user.lockUntil.getTime && user.lockUntil.getTime() > Date.now()) {
    return res.status(429).json({ success: false, error: 'Account temporarily locked. Try again later.' });
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    const attempts = Number(user.loginAttempts || 0) + 1;
    user.loginAttempts = attempts;
    if (attempts >= MAX_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_MS);
    }
    await user.save({ validateBeforeSave: false });
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  if (user.loginAttempts || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
  }

  const token = createAccessToken(user);
  const tid = crypto.randomBytes(16).toString('hex');
  const refresh = createRefreshToken(user, tid);

  user.refreshTokenHash = hash(tid);
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  setCookie(res, 'accessToken', token, { maxAge: 15 * 60 * 1000 });
  setCookie(res, 'refreshToken', refresh, { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });

  res.status(200).json({
    success: true,
    token,
    user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).populate('departmentId').lean();

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Refresh access token (rotating refresh token)
// @route   POST /api/auth/refresh
// @access  Public (uses http-only cookie)
exports.refresh = asyncHandler(async (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) return res.status(401).json({ success: false, error: 'Missing refresh token' });

  let payload;
  try {
    payload = require('jsonwebtoken').verify(rt, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }

  const user = await User.findById(payload.id).select('+password');
  if (!user || !user.refreshTokenHash || !user.refreshTokenExpires || user.refreshTokenExpires.getTime() < Date.now()) {
    return res.status(401).json({ success: false, error: 'Refresh token expired' });
  }

  if (hash(payload.tid || '') !== user.refreshTokenHash) {
    return res.status(401).json({ success: false, error: 'Refresh token mismatch' });
  }

  const newAccess = createAccessToken(user);
  const newTid = crypto.randomBytes(16).toString('hex');
  const newRefresh = createRefreshToken(user, newTid);
  user.refreshTokenHash = hash(newTid);
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  setCookie(res, 'accessToken', newAccess, { maxAge: 15 * 60 * 1000 });
  setCookie(res, 'refreshToken', newRefresh, { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });

  res.status(200).json({ success: true, token: newAccess });
});

// @desc    Logout (clear cookies)
// @route   POST /api/auth/logout
// @access  Public
exports.logout = asyncHandler(async (req, res) => {
  if (req.user?._id) {
    await User.findByIdAndUpdate(req.user._id, { $unset: { refreshTokenHash: 1, refreshTokenExpires: 1 } }).catch(() => {});
  }
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.status(200).json({ success: true, message: 'Logged out' });
});

// @desc    Forgot password (send reset link)
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Please provide an email' });
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(200).json({ success: true, message: 'If that email exists, a reset link was sent.' });
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const resetUrl = `${frontendUrl}/auth/reset-password/${resetToken}`;

  const html = `
    <div>
      <p>To reset your password, open this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 10 minutes.</p>
    </div>
  `;

  const result = await sendEmail({
    to: user.email,
    subject: 'PropNinja HR - Password Reset',
    html,
    text: `Reset your password: ${resetUrl}`
  });

  res.status(200).json({
    success: true,
    message: result.sent ? 'Reset link sent.' : 'Email not configured. Use the resetUrl.',
    resetUrl
  });
});

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Please provide a new password' });
  }

  const resetPasswordToken = crypto.createHash('sha256').update(req.params.resettoken).digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  }).select('+password');

  if (!user) {
    return res.status(400).json({ success: false, error: 'Invalid or expired token' });
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// Legacy helper (unused): kept for backward compatibility
const sendTokenResponse = (user, statusCode, res) => {
  const token = createAccessToken(user);
  res.status(statusCode).json({
    success: true,
    token,
    user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
  });
};
