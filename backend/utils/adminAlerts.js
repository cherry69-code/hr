const User = require('../models/User');
const sendEmail = require('./sendEmail');

const isEnabled = () => String(process.env.ADMIN_ALERTS_ENABLED || '').toLowerCase() === 'true';

const getAdminEmails = async () => {
  const admins = await User.find({ role: 'admin', status: 'active' }).select('email').lean();
  return (admins || []).map((a) => a.email).filter(Boolean);
};

const sendAdminAlert = async ({ subject, html, text }) => {
  if (!isEnabled()) return;
  const toList = await getAdminEmails();
  if (!toList.length) return;
  const to = toList.join(',');
  await sendEmail({ to, subject, html, text });
};

module.exports = { sendAdminAlert };
