const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const ms = (v) => v * 1000;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getRedis } = require('../config/redis');

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

const signJwtAsync = (payload, secret, options) =>
  new Promise((resolve, reject) => {
    jwt.sign(payload, secret, options, (err, token) => {
      if (err || !token) return reject(err || new Error('sign_failed'));
      resolve(token);
    });
  });

const createAccessTokenAsync = (user) =>
  signJwtAsync({ uid: String(user._id), role: String(user.role) }, process.env.JWT_SECRET, { expiresIn: '15m' });

const createRefreshTokenAsync = (userId, tokenId) =>
  signJwtAsync(
    { uid: String(userId), tid: String(tokenId) },
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

  const tid = crypto.randomBytes(16).toString('hex');
  const [token, refresh] = await Promise.all([createAccessTokenAsync(user), createRefreshTokenAsync(user._id, tid)]);
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
  if (!password) {
    return res.status(400).json({ success: false, error: 'Please provide password' });
  }

  const empCode = employeeCode ? String(employeeCode).trim() : '';
  const emailNorm = email ? String(email).trim() : '';
  if (!empCode && !emailNorm) return res.status(400).json({ success: false, error: 'Please provide Email or Employee Code' });

  const redis = getRedis();
  const cacheKey = empCode ? `auth:user:${empCode}` : `auth:user:${emailNorm}`;
  let cached = null;
  if (redis) cached = await redis.get(cacheKey).catch(() => null);

  let user = null;
  if (cached) {
    try {
      user = JSON.parse(cached);
    } catch {}
  }

  if (!user) {
    const query = empCode ? { employeeId: empCode } : { email: emailNorm };
    const row = await User.findOne(query)
      .select('_id password role status employeeId email')
      .lean();
    if (!row) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    user = {
      id: String(row._id),
      password_hash: String(row.password || ''),
      role: String(row.role || 'employee'),
      status: String(row.status || ''),
      employee_code: row.employeeId ? String(row.employeeId) : null,
      email: row.email ? String(row.email) : null
    };
    if (redis) {
      const v = JSON.stringify(user);
      const p = redis.pipeline();
      if (user.employee_code) p.set(`auth:user:${user.employee_code}`, v, 'EX', 600);
      if (user.email) p.set(`auth:user:${user.email}`, v, 'EX', 600);
      await p.exec().catch(() => {});
    }
  }

  if (String(user.status || '').toLowerCase() === 'inactive') {
    return res.status(403).json({ success: false, error: 'Account inactive' });
  }

  const ok = await bcrypt.compare(String(password), String(user.password_hash || ''));
  if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

  const tid = crypto.randomBytes(16).toString('hex');
  const refreshTokenHash = hash(tid);
  const refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [token, refreshToken] = await Promise.all([
    signJwtAsync({ uid: String(user.id), role: String(user.role) }, process.env.JWT_SECRET, { expiresIn: '15m' }),
    createRefreshTokenAsync(String(user.id), tid)
  ]);

  await User.updateOne({ _id: user.id }, { $set: { refreshTokenHash, refreshTokenExpires } }).catch(() => {});

  setCookie(res, 'accessToken', token, { maxAge: 15 * 60 * 1000 });
  setCookie(res, 'refreshToken', refreshToken, { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });

  res.status(200).json({ success: true, token, refreshToken, role: user.role });
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
    payload = jwt.verify(rt, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }

  const userId = payload.uid || payload.id;
  const user = await User.findById(userId).select('refreshTokenHash refreshTokenExpires role');
  if (!user || !user.refreshTokenHash || !user.refreshTokenExpires || user.refreshTokenExpires.getTime() < Date.now()) {
    return res.status(401).json({ success: false, error: 'Refresh token expired' });
  }

  if (hash(payload.tid || '') !== user.refreshTokenHash) {
    return res.status(401).json({ success: false, error: 'Refresh token mismatch' });
  }

  const newTid = crypto.randomBytes(16).toString('hex');
  const newRefreshTokenHash = hash(newTid);
  const newRefreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [newAccess, newRefresh] = await Promise.all([createAccessTokenAsync(user), createRefreshTokenAsync(user._id, newTid)]);
  await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: newRefreshTokenHash, refreshTokenExpires: newRefreshTokenExpires } }).catch(() => {});

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
  const token = jwt.sign({ uid: String(user._id), role: String(user.role) }, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.status(statusCode).json({
    success: true,
    token,
    user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
  });
};
