const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('--- SMTP Config Check ---');
console.log('Host:', process.env.SMTP_HOST);
console.log('Port:', process.env.SMTP_PORT);
console.log('User:', process.env.SMTP_USER);
console.log('Secure:', process.env.SMTP_SECURE);

const sendTestEmail = async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000
    });

    console.log('Verifying connection...');
    await transporter.verify();
    console.log('✅ Connection Verified!');

    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.SMTP_USER, // Send to self
      subject: 'Test Email from PropNinja Backend',
      text: 'If you receive this, SMTP is working.'
    });

    console.log('✅ Email Sent!', info.messageId);
  } catch (err) {
    console.error('❌ SMTP Error:', err);
  }
};

sendTestEmail();