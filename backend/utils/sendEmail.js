const nodemailer = require('nodemailer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const sendEmail = async (options) => {
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_PASSWORD;
  const allowFallback = String(process.env.SMTP_FALLBACK || 'true').toLowerCase() === 'true';
  const sendgridKey = process.env.SENDGRID_API_KEY || '';
  // Remove leading dash if present (common copy-paste error from user input like "- 831...")
  const rawPostmarkKey = process.env.POSTMARK_API_KEY || '';
  const postmarkKey = rawPostmarkKey.startsWith('-') ? rawPostmarkKey.substring(1) : rawPostmarkKey;

  // 0) Prefer Postmark HTTP API (Known to be reliable)
  // Since your Postmark app is approved for other domains, we use it directly.
  if (postmarkKey) {
    try {
      const to = options.to || options.email;
      const fromEmail = process.env.FROM_EMAIL || 'hr@propninja.com';
      const subject = options.subject;
      const text = options.text || options.message || '';
      const html = options.html || `<p>${text}</p>`;

      const payload = {
        From: fromEmail,
        To: to,
        Subject: subject,
        TextBody: text,
        HtmlBody: html,
        MessageStream: 'outbound'
      };

      // Attachments for Postmark
      if (Array.isArray(options.attachments) && options.attachments.length) {
        payload.Attachments = options.attachments
          .map((att) => {
            if (att.path && fs.existsSync(att.path)) {
              const fileBuf = fs.readFileSync(att.path);
              return {
                Name: att.filename || path.basename(att.path),
                Content: fileBuf.toString('base64'),
                ContentType: att.contentType || 'application/octet-stream'
              };
            }
            return null;
          })
          .filter(Boolean);
      }

      const body = JSON.stringify(payload);
      const reqOptions = {
        method: 'POST',
        host: 'api.postmarkapp.com',
        path: '/email',
        headers: {
          'X-Postmark-Server-Token': postmarkKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      };

      const response = await new Promise((resolve, reject) => {
        const req = https.request(reqOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Postmark request timeout')));
        req.write(body);
        req.end();
      });

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { sent: true, messageId: 'postmark:accepted' };
      }
      
      // If Postmark fails, log it and fall through
      console.error(`Postmark error ${response.statusCode}:`, response.body);
    } catch (e) {
      console.error('Postmark exception:', e.message);
    }
  }

  // 1) Prefer SendGrid HTTP API if key is present (avoids SMTP firewalls/timeouts)
  if (sendgridKey) {
    try {
      const to = options.to || options.email;
      const fromEmail = process.env.FROM_EMAIL;
      const fromName = process.env.FROM_NAME || 'PropNinja HR';
      const subject = options.subject;
      const text = options.text || options.message || '';
      const html = options.html || `<p>${text}</p>`;

      const payload = {
        personalizations: [{ to: [{ email: to }], subject }],
        from: { email: fromEmail, name: fromName },
        content: [
          { type: 'text/plain', value: text || '' },
          { type: 'text/html', value: html || '' }
        ]
      };

      // Optional attachments (path-based -> base64)
      if (Array.isArray(options.attachments) && options.attachments.length) {
        payload.attachments = options.attachments
          .map((att) => {
            // Support both {path, filename, contentType} and Buffer-based
            if (att.path && fs.existsSync(att.path)) {
              const fileBuf = fs.readFileSync(att.path);
              return {
                content: fileBuf.toString('base64'),
                filename: att.filename || path.basename(att.path),
                type: att.contentType || 'application/octet-stream',
                disposition: 'attachment'
              };
            }
            return null;
          })
          .filter(Boolean);
      }

      const body = JSON.stringify(payload);
      const reqOptions = {
        method: 'POST',
        host: 'api.sendgrid.com',
        path: '/v3/mail/send',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000 // hard timeout for network issues
      };

      const response = await new Promise((resolve, reject) => {
        const req = https.request(reqOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy(new Error('SendGrid request timeout'));
        });
        req.write(body);
        req.end();
      });

      // SendGrid returns 202 for success
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { sent: true, messageId: 'sendgrid:accepted' };
      }

      const err = new Error(`SendGrid error ${response.statusCode}: ${response.body || ''}`.trim());
      // fall through to SMTP fallback
      throw err;
    } catch (e) {
      // If SendGrid fails, continue to SMTP fallback below
      // console.error('[SendGrid] Failed, will try SMTP fallback:', e.message);
    }
  }

  // 2) SMTP path with 465/implicit TLS primary + 587/STARTTLS fallback
  const primaryOptions = process.env.SMTP_SERVICE
    ? {
        service: process.env.SMTP_SERVICE,
        auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000
      }
    : {
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpSecure,
        auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000
      };

  const fallbackOptions = {
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    requireTLS: true,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
  };

  let transporter;
  let lastErr;
  try {
    transporter = nodemailer.createTransport(primaryOptions);
    await transporter.verify();
  } catch (e) {
    lastErr = e;
    const code = e && e.code ? String(e.code).toUpperCase() : '';
    const shouldFallback =
      allowFallback &&
      (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ESOCKET' || !code);
    if (shouldFallback) {
      try {
        transporter = nodemailer.createTransport(fallbackOptions);
        await transporter.verify();
      } catch (e2) {
        lastErr = e2;
      }
    }
  }
  if (!transporter) {
    const err = lastErr || new Error('SMTP transporter initialization failed');
    err.meta = { primaryOptions, fallbackTried: Boolean(allowFallback) };
    throw err;
  }

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
