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
    console.log('--- Attempt 1: Port 465 (SSL) ---');
    try {
        await testConfig({
            host: process.env.SMTP_HOST,
            port: 465,
            secure: true,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        });
        return;
    } catch (e) { console.log('Attempt 1 Failed:', e.response || e.message); }

    console.log('\n--- Attempt 2: Port 587 (TLS) ---');
    try {
        await testConfig({
            host: process.env.SMTP_HOST,
            port: 587,
            secure: false, // TLS upgrades connection
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        });
        return;
    } catch (e) { console.log('Attempt 2 Failed:', e.response || e.message); }

    console.log('\n--- Attempt 3: Username without domain ---');
    const userShort = process.env.SMTP_USER.split('@')[0];
    try {
        await testConfig({
            host: process.env.SMTP_HOST,
            port: 465,
            secure: true,
            auth: { user: userShort, pass: process.env.SMTP_PASSWORD }
        });
        return;
    } catch (e) { console.log('Attempt 3 Failed:', e.response || e.message); }
    console.log('--- Attempt 4: Try Password Casper@123 ---');
    try {
        await testConfig({
            host: process.env.SMTP_HOST,
            port: 465,
            secure: true,
            auth: { user: process.env.SMTP_USER, pass: 'Casper@123' }
        });
        return;
    } catch (e) { console.log('Attempt 4 Failed:', e.response || e.message); }
};

const testConfig = async (config) => {
    const transporter = nodemailer.createTransport({
        ...config,
        connectionTimeout: 5000,
        greetingTimeout: 5000
    });
    console.log(`Verifying ${config.host}:${config.port} user=${config.auth.user}...`);
    await transporter.verify();
    console.log('✅ Connection Verified!');
    
    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.SMTP_USER,
      subject: 'Test Email PropNinja',
      text: 'SMTP Working!'
    });
    console.log('✅ Email Sent!', info.messageId);
};

sendTestEmail();