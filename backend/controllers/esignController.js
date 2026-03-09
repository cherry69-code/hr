const Document = require('../models/Document');
const User = require('../models/User');
const crypto = require('crypto');
const asyncHandler = require('../middlewares/asyncHandler');
const { generateFinalPdfWithSignatures } = require('../services/documentGenerator.service'); // We'll update this service
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');
const AuditLog = require('../models/AuditLog');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const getBackendPublicBaseUrl = () => {
  const base = process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:5000';
  return String(base).replace(/\/$/, '');
};

const persistFinalPdfLocally = ({ fileName, srcPath }) => {
  const outDir = path.join(__dirname, '..', 'uploads', 'documents', 'signed');
  fs.mkdirSync(outDir, { recursive: true });
  const destPath = path.join(outDir, fileName);
  fs.copyFileSync(srcPath, destPath);
  return `${getBackendPublicBaseUrl()}/uploads/documents/signed/${fileName}`;
};

const getFinalEmailSubject = (documentType) => {
  if (documentType === 'offer_letter') return 'FINAL SIGNED OFFER LETTER FROM PRONINJA CONSULTING PRIVATE LIMITED';
  if (documentType === 'joining_agreement') return 'FINAL SIGNED JOINING AGREEMENT FROM PRONINJA CONSULTING PRIVATE LIMITED';
  return 'FINAL SIGNED DOCUMENT FROM PRONINJA CONSULTING PRIVATE LIMITED';
};

const getDocumentTitle = (documentType) => {
  if (documentType === 'offer_letter') return 'Offer Letter';
  if (documentType === 'joining_agreement') return 'Joining Agreement';
  return 'Document';
};

const sendFinalSignedEmail = async ({ employee, documentType, finalUrl, localPdfPath }) => {
  const title = getDocumentTitle(documentType);
  const safeFinalUrl = finalUrl || '';
  const downloadHtml = safeFinalUrl
    ? `<p>Download: <a href="${safeFinalUrl}">${safeFinalUrl}</a></p>`
    : '';
  const downloadText = safeFinalUrl ? ` Download: ${safeFinalUrl}` : '';

  const baseOptions = {
    to: employee.email,
    subject: getFinalEmailSubject(documentType),
    text: `Please find the signed copy of your ${title}.${downloadText}`,
    html: `
      <p>Dear ${employee.fullName},</p>
      <p>Please find the signed copy of your ${title}.</p>
      ${downloadHtml}
      <p>Regards,<br/>Team HR</p>
    `
  };

  try {
    await sendEmail({
      ...baseOptions,
      attachments: localPdfPath
        ? [
          {
            filename: `${title}.pdf`,
            path: localPdfPath,
            contentType: 'application/pdf'
          }
        ]
        : undefined
    });
    return { emailSent: true, emailError: '' };
  } catch (err) {
    try {
      await sendEmail(baseOptions);
      return { emailSent: true, emailError: '' };
    } catch (err2) {
      const msg = err2 && err2.message ? err2.message : (err && err.message ? err.message : 'Email could not be sent');
      return { emailSent: false, emailError: msg };
    }
  }
};

// @desc    Get pending documents for HR to sign
// @route   GET /api/esign/pending
// @access  Private (HR/Admin)
exports.getPendingHrDocuments = asyncHandler(async (req, res, next) => {
  const documents = await Document.find({
    status: 'EmployeeSigned'
  }).populate('employeeId', 'fullName email designation');

  res.status(200).json({ success: true, data: documents });
});

// @desc    Get document for signing
// @route   GET /api/esign/sign/:token
// @access  Public
exports.getSigningPage = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  const document = await Document.findOne({ token });

  if (!document) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  // Check expiry
  if (document.tokenExpiry && document.tokenExpiry < Date.now()) {
    return res.status(400).json({ success: false, error: 'Link has expired' });
  }

  // Check status
  if (document.status === 'Completed') {
    return res.status(400).json({ success: false, error: 'Document already completed' });
  }

  // Return HTML content (or PDF URL)
  res.status(200).json({
    success: true,
    data: {
      htmlContent: document.htmlContent,
      pdfUrl: document.url,
      signedPdfUrl: (() => {
        try {
          const original = String(document.url || '');
          // Extract publicId: res.cloudinary.com/<cloud>/raw/upload/v1234/<publicId>.pdf
          const match = original.match(/\/raw\/upload\/(?:v\d+\/)?(.+)\.pdf$/);
          if (!match || !match[1]) return '';
          const publicId = match[1]; // includes folder e.g. 'documents/joining_letter_...'
          // Generate a signed URL to avoid 401 on direct access
          const signed = cloudinary.url(publicId, {
            resource_type: 'raw',
            type: 'upload',
            format: 'pdf',
            secure: true,
            sign_url: true
          });
          return signed || '';
        } catch (e) {
          return '';
        }
      })(),
      employeeName: (await User.findById(document.employeeId)).fullName,
      status: document.status
    }
  });
});

// @desc    Get document PDF for signing preview (proxied)
// @route   GET /api/esign/pdf/:token
// @access  Public
exports.getSigningPdf = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const document = await Document.findOne({ token }).lean();

  if (!document) {
    return res.status(404).send('Not found');
  }

  if (document.tokenExpiry && document.tokenExpiry < Date.now()) {
    return res.status(400).send('Link expired');
  }

  const original = String(document.url || '');
  const match = original.match(/\/raw\/upload\/(?:v\d+\/)?(.+)\.pdf$/);
  if (!match || !match[1]) {
    return res.status(404).send('PDF not available');
  }

  const publicId = `${match[1]}.pdf`;
  const signedDownloadUrl = cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'raw',
    type: 'upload',
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + 300
  });

  const u = new URL(signedDownloadUrl);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
  res.setHeader('Cache-Control', 'no-store');

  await new Promise((resolve, reject) => {
    const req2 = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        headers: { 'User-Agent': 'prophr' }
      },
      (resp) => {
        if (resp.statusCode && resp.statusCode >= 400) {
          res.status(resp.statusCode).end();
          resolve(null);
          return;
        }
        resp.pipe(res);
        resp.on('end', resolve);
      }
    );
    req2.on('error', reject);
    req2.end();
  });
});

const sendEmail = require('../utils/sendEmail'); // Import sendEmail

// @desc    Sign document (Employee)
// @route   POST /api/esign/sign/:token
// @access  Public
exports.signDocument = asyncHandler(async (req, res, next) => {
  try {
    const { token } = req.params;
    const { signature } = req.body; // Base64 signature

    console.log('>>> SIGNING REQUEST RECEIVED');
    console.log('Token:', token);
    console.log('Signature length:', signature ? signature.length : 'MISSING');

    if (!signature) {
      console.error('ERROR: Signature is required');
      return res.status(400).json({ success: false, error: 'Signature is required' });
    }

    const document = await Document.findOne({ token }).populate('employeeId'); // Populate employee

    if (!document) {
      console.error('ERROR: Document not found for token:', token);
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    if (document.tokenExpiry && document.tokenExpiry < Date.now()) {
      console.error('ERROR: Token expired');
      return res.status(400).json({ success: false, error: 'Link has expired' });
    }

    if (document.status !== 'Sent') {
      console.error('ERROR: Invalid status:', document.status);
      return res.status(400).json({ success: false, error: 'Document already signed or completed' });
    }

    // Save Signature
    document.employeeSignature = signature;
    document.employeeSignedAt = Date.now();
    document.employeeIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    document.employeeUserAgent = req.headers['user-agent'];
    document.status = 'Completed'; // Employee is now the LAST signer

    await document.save();
    console.log('>>> SIGNATURE SAVED SUCCESSFULLY. New Status:', document.status);

    // --- FINALIZE DOCUMENT (GENERATE PDF) ---
    // Since HR has already signed (during creation), and now Employee signed, we can generate the final PDF immediately.
    
    try {
        const employee = document.employeeId;
        const fileName = `signed_${document.type}_${employee._id}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, '../utils', fileName);

        console.log('>>> GENERATING FINAL PDF:', filePath);
        
        // Call generator service to create PDF with BOTH signatures
        await generateFinalPdfWithSignatures(document, filePath);

        // Calculate Hash (SHA256)
        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        document.documentHash = hash;
        await document.save();

        let finalUrl = '';
        try {
          const { encryptBuffer } = require('../utils/e2ee');
          const encBuf = encryptBuffer(fileBuffer);
          fs.writeFileSync(filePath + '.enc', encBuf);
        } catch {}
        try {
          console.log('>>> UPLOADING TO CLOUDINARY...');
          const result = await cloudinary.uploader.upload(fs.existsSync(filePath + '.enc') ? (filePath + '.enc') : filePath, {
            resource_type: 'raw',
            folder: 'documents/signed',
            public_id: fileName
          });
          finalUrl = result.secure_url;
          console.log('>>> UPLOAD SUCCESS:', finalUrl);

          document.url = finalUrl;
          await document.save();

          const updateField = {};
          if (document.type === 'joining_agreement') {
            updateField['documents.joiningAgreement'] = { url: finalUrl, signed: true, uploadedAt: Date.now() };
            updateField['documents.joiningLetter'] = { url: finalUrl, signed: true, uploadedAt: Date.now() };
            updateField['status'] = 'active';
          } else if (document.type === 'offer_letter') {
            updateField['documents.offerLetter'] = { url: finalUrl, signed: true, uploadedAt: Date.now() };
            updateField['status'] = 'OFFER_LETTER_SIGNED';
          }

          if (employee && employee._id && Object.keys(updateField).length) {
            const updatedUser = await User.findByIdAndUpdate(employee._id, { $set: updateField }, { new: true });
            console.log('>>> USER PROFILE UPDATED:', updatedUser ? 'SUCCESS' : 'FAILED');
          }
        } catch (uploadErr) {
          console.error('>>> CLOUDINARY UPLOAD FAILED:', uploadErr && uploadErr.message ? uploadErr.message : uploadErr);
        }

        if (!finalUrl) {
          try {
            finalUrl = persistFinalPdfLocally({ fileName, srcPath: filePath });
            document.url = finalUrl;
            await document.save();

            const updateField = {};
            if (document.type === 'joining_agreement') {
              updateField['documents.joiningAgreement'] = { url: finalUrl, signed: true, uploadedAt: Date.now() };
              updateField['documents.joiningLetter'] = { url: finalUrl, signed: true, uploadedAt: Date.now() };
              updateField['status'] = 'active';
            } else if (document.type === 'offer_letter') {
              updateField['documents.offerLetter'] = { url: finalUrl, signed: true, uploadedAt: Date.now() };
              updateField['status'] = 'OFFER_LETTER_SIGNED';
            }

            if (employee && employee._id && Object.keys(updateField).length) {
              const updatedUser = await User.findByIdAndUpdate(employee._id, { $set: updateField }, { new: true });
              console.log('>>> USER PROFILE UPDATED:', updatedUser ? 'SUCCESS' : 'FAILED');
            }
          } catch (localErr) {
            console.error('>>> LOCAL PDF SAVE FAILED:', localErr && localErr.message ? localErr.message : localErr);
          }
        }

        // Persist HTML hash for tamper-evidence
        try {
          if (document.htmlContent) {
            const htmlHash = crypto.createHash('sha256').update(document.htmlContent, 'utf8').digest('hex');
            document.htmlHash = htmlHash;
            await document.save();
          }
        } catch {}

        // Audit log
        try {
          await AuditLog.create({
            documentId: document._id,
            action: 'employee_signed',
            performedBy: String(employee._id),
            ipAddress: document.employeeIP || '',
            meta: { userAgent: document.employeeUserAgent || '' }
          });
        } catch {}

        // Email Final PDF to Employee
        console.log('>>> SENDING FINAL EMAIL TO EMPLOYEE:', employee.email);
        const emailResult = await sendFinalSignedEmail({
          employee,
          documentType: document.type,
          finalUrl,
          localPdfPath: filePath
        });
        if (emailResult.emailSent) {
          console.log('>>> FINAL EMAIL SENT SUCCESSFULLY');
        } else {
          console.error('>>> FAILED TO SEND FINAL EMAIL:', emailResult.emailError);
        }

        // Cleanup
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(filePath + '.enc')) fs.unlinkSync(filePath + '.enc');

    } catch (err) {
        console.error('>>> ERROR FINALIZING DOCUMENT:', err);
        // We don't fail the request here, but we log the error. The signature is saved.
    }

    res.status(200).json({ success: true, message: 'Signed successfully & Final Copy Sent' });
  } catch (error) {
    console.error('>>> SERVER ERROR DURING SIGNING:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// @desc    HR Countersign
// @route   POST /api/esign/hr-sign/:id
// @access  Private (HR/Admin)
exports.hrSignDocument = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { signature } = req.body; // HR Signature Base64

  const document = await Document.findById(id).populate('employeeId');

  if (!document) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  if (document.status !== 'EmployeeSigned') {
    return res.status(400).json({ success: false, error: 'Employee has not signed yet' });
  }

  // Save HR Signature
  document.hrSignature = signature;
  document.hrSignedAt = Date.now();
  document.status = 'Completed';

  // Generate Final PDF
  const employee = document.employeeId;
  const fileName = `signed_${document.type}_${employee._id}_${Date.now()}.pdf`;
  const filePath = path.join(__dirname, '../utils', fileName);

  // Call generator service to create PDF with BOTH signatures
  await generateFinalPdfWithSignatures(document, filePath);

  // Upload to Cloudinary
  let finalUrl = '';
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'raw',
      folder: 'documents/signed',
      public_id: fileName
    });
    finalUrl = result.secure_url;
  } catch (uploadErr) {
    finalUrl = '';
  }

  if (!finalUrl) {
    try {
      finalUrl = persistFinalPdfLocally({ fileName, srcPath: filePath });
    } catch (localErr) {
      finalUrl = '';
    }
  }

  // Calculate Hash (SHA256)
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Update Document
  if (finalUrl) document.url = finalUrl;
  document.documentHash = hash;
  await document.save();

  // Update User Profile with final document link
  const updateField = {};
  if (finalUrl) {
    if (document.type === 'joining_agreement') {
      updateField['documents.joiningAgreement'] = { url: finalUrl, uploadedAt: Date.now() };
      updateField['documents.joiningLetter'] = { url: finalUrl, uploadedAt: Date.now() };
    } else if (document.type === 'offer_letter') {
      updateField['documents.offerLetter'] = { url: finalUrl, uploadedAt: Date.now() };
    }
    await User.findByIdAndUpdate(employee._id, { $set: updateField });
  }

  // Persist HTML hash & audit
  try {
    if (document.htmlContent) {
      const htmlHash = crypto.createHash('sha256').update(document.htmlContent, 'utf8').digest('hex');
      document.htmlHash = htmlHash;
      await document.save();
    }
    await AuditLog.create({
      documentId: document._id,
      action: 'hr_signed',
      performedBy: String(employee._id),
      ipAddress: req.ip || '',
      meta: {}
    });
  } catch {}

  const emailResult = await sendFinalSignedEmail({
    employee,
    documentType: document.type,
    finalUrl,
    localPdfPath: filePath
  });

  // Cleanup
  fs.unlinkSync(filePath);

  res.status(200).json({ success: true, data: document, emailSent: emailResult.emailSent, emailError: emailResult.emailError });
});
