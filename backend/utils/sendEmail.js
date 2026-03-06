const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_PASSWORD;

  const transportOptions = process.env.SMTP_SERVICE
    ? {
      service: process.env.SMTP_SERVICE,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
      connectionTimeout: 5000, // 5 seconds
      greetingTimeout: 5000,   // 5 seconds
      socketTimeout: 10000     // 10 seconds
    }
    : {
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
      connectionTimeout: 5000, // 5 seconds
      greetingTimeout: 5000,   // 5 seconds
      socketTimeout: 10000     // 10 seconds
    };

  const transporter = nodemailer.createTransport(transportOptions);

  const to = options.to || options.email;
  const subject = options.subject;
  const text = options.text || options.message;

  const message = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to,
    subject,
    text,
    html: options.html,
    attachments: options.attachments,
  };

  const info = await transporter.sendMail(message);

  return { sent: true, messageId: info.messageId };
};

module.exports = sendEmail;
