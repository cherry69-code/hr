const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const templateRepo = require('../repositories/documentTemplate.repository');
const esignRepo = require('../repositories/esignDocument.repository');
const employeeDocRepo = require('../repositories/employeeDocument.repository');
const auditRepo = require('../repositories/auditLog.repository');

const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { render } = require('./templateEngine.service');
const { generateFinalPdf } = require('./pdf.service');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const buildEmployeePlaceholderData = (employee) => {
  const dept = employee.departmentId?.name || '';
  const team = employee.teamId?.name || '';
  return {
    employeeName: employee.fullName || '',
    fatherName: employee.personalDetails?.fatherName || '',
    address: employee.address || '',
    designation: employee.designation || '',
    department: dept,
    ctcAnnual: employee.salary?.ctc || '',
    joiningDate: employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-GB') : '',
    employeeId: employee.employeeId || '',
    panNumber: employee.personalDetails?.panNumber || '',
    aadhaarNumber: employee.personalDetails?.aadharNumber || '',
    probationPeriod: employee.probationPeriod || '',
    jobLocation: employee.jobLocation || '',
    salesTeam: team,
    team: team
  };
};

exports.getActiveTemplate = async (companyId, templateType) => {
  return templateRepo.getActive(companyId, templateType);
};

exports.generatePreview = async ({ companyId, employeeId, documentType }) => {
  const employee = await User.findById(employeeId).populate('departmentId').populate('teamId').lean();
  if (!employee) return { error: 'Employee not found' };

  const templateType = documentType;
  const template = await templateRepo.getActive(companyId, templateType);
  if (!template) return { error: 'No active template found' };

  const htmlContent = render(template.htmlContent, buildEmployeePlaceholderData(employee));

  return {
    templateId: template._id,
    htmlContent
  };
};

exports.sendForEsign = async ({ companyId, employeeId, documentType, htmlContent, performedByUserId, publicBaseUrl }) => {
  const employee = await User.findById(employeeId).lean();
  if (!employee) return { error: 'Employee not found' };

  // 64-char token (32 bytes hex)
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const doc = await esignRepo.create({
    companyId,
    employeeId,
    documentType,
    htmlContent,
    status: 'sent',
    tokenHash,
    tokenExpiresAt,
    sentAt: new Date(),
    hrSigned: false,
    employeeSigned: false
  });

  await auditRepo.add({
    documentId: doc._id,
    action: 'sent_for_esign',
    performedBy: String(performedByUserId),
    ipAddress: '',
    meta: { documentType }
  });

  const link = `${publicBaseUrl.replace(/\/$/, '')}/sign/${token}`;

  let emailSent = false;
  let emailError = '';
  try {
    await sendEmail({
      to: employee.email,
      subject: 'Please review and sign your document',
      html: `<p>Please review and sign your document.</p><p><a href="${link}">${link}</a></p>`,
      text: `Please review and sign your document: ${link}`
    });
    emailSent = true;
  } catch (e) {
    emailSent = false;
    emailError = e && e.message ? e.message : 'Email could not be sent';
  }

  return { id: doc._id, link, emailSent, emailError };
};

exports.getPublicDocumentByToken = async ({ token }) => {
  const tokenHash = sha256(token);
  const doc = await esignRepo.findByTokenHash(tokenHash);
  if (!doc) return { error: 'Invalid link' };

  if (doc.status === 'completed') return { error: 'Link already used' };
  if (doc.employeeSigned) return { error: 'Link already used' };
  if (doc.tokenExpiresAt && new Date(doc.tokenExpiresAt).getTime() < Date.now()) return { error: 'Link expired' };

  return { doc };
};

exports.employeeSign = async ({ token, signatureData, agreed, ipAddress, userAgent }) => {
  if (!agreed) return { error: 'Please accept terms' };

  const tokenHash = sha256(token);
  const existing = await esignRepo.findByTokenHash(tokenHash);
  if (!existing) return { error: 'Invalid link' };
  if (existing.status === 'completed') return { error: 'Link already used' };
  if (existing.tokenExpiresAt && new Date(existing.tokenExpiresAt).getTime() < Date.now()) return { error: 'Link expired' };
  if (existing.employeeSigned) return { error: 'Already signed' };

  const updated = await esignRepo.updateById(existing._id, {
    $set: {
      employeeSigned: true,
      status: 'employee_signed',
      signedAt: new Date(),
      employeeIP: ipAddress,
      employeeUserAgent: userAgent,
      employeeSignature: { image: signatureData, ipAddress, signedAt: new Date() }
    }
  });

  await auditRepo.add({
    documentId: existing._id,
    action: 'employee_signed',
    performedBy: 'employee',
    ipAddress,
    meta: { userAgent }
  });

  return { doc: updated };
};

const { generateOfferLetterPdf, generateJoiningAgreementPdf } = require('./documentGenerator.service');

exports.hrCountersign = async ({ documentId, signatureData, ipAddress, performedByUserId }) => {
  const existing = await esignRepo.findByIdLean(documentId);
  if (!existing) return { error: 'Document not found' };
  if (existing.status === 'completed') return { error: 'Already completed' };
  if (existing.tokenExpiresAt && new Date(existing.tokenExpiresAt).getTime() < Date.now()) return { error: 'Link expired' };
  if (!existing.employeeSigned) return { error: 'Employee has not signed yet' };

  const updated = await esignRepo.updateById(existing._id, {
    $set: {
      hrSigned: true,
      hrSignature: { image: signatureData, ipAddress, signedAt: new Date() }
    }
  });

  await auditRepo.add({
    documentId: existing._id,
    action: 'hr_signed',
    performedBy: String(performedByUserId),
    ipAddress,
    meta: {}
  });

  const employee = await User.findById(existing.employeeId).populate('departmentId').lean();
  const employeeIdStr = employee?.employeeId || String(existing.employeeId);
  const safeCompanyId = existing.companyId || 'propninja';
  const fileName = `${existing.documentType}_signed.pdf`;
  const outputPath = path.join(__dirname, '..', 'uploads', safeCompanyId, employeeIdStr, fileName);

  const title = existing.documentType === 'offer' ? 'Offer Letter' : existing.documentType;
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const signatures = {
    employeeSignature: existing.employeeSignature?.image,
    hrSignature: signatureData
  };

  // Use specialized generator if available, otherwise fallback to basic PDF
  if (existing.documentType === 'offer') {
    await generateOfferLetterPdf(employee, outputPath, signatures);
  } else if (existing.documentType === 'agreement' || existing.documentType === 'joining_agreement') {
    await generateJoiningAgreementPdf(employee, outputPath, signatures);
  } else {
    // Fallback to basic HTML-to-PDF logic
    await generateFinalPdf({
        outputPath,
        title,
        htmlContent: existing.htmlContent,
        employeeName: employee?.fullName || '',
        employeeSignatureDataUrl: existing.employeeSignature?.image || '',
        hrSignatureDataUrl: signatureData
    });
  }

  // Calculate SHA256 hash of the final PDF
  const pdfBuffer = fs.readFileSync(outputPath);
  const documentHash = sha256(pdfBuffer);

  const publicUrl = `/uploads/${safeCompanyId}/${employeeIdStr}/${fileName}`;

  await employeeDocRepo.create({
    employeeId: existing.employeeId,
    documentType: existing.documentType,
    fileUrl: publicUrl,
    sourceEsignDocumentId: existing._id
  });

  const completed = await esignRepo.updateById(existing._id, {
    $set: { status: 'completed', finalPdfPath: publicUrl, documentHash }
  });

  await auditRepo.add({
    documentId: existing._id,
    action: 'completed',
    performedBy: String(performedByUserId),
    ipAddress,
    meta: { fileUrl: publicUrl, documentHash }
  });

  // Send final PDF to employee
  try {
    const employeeData = await User.findById(existing.employeeId).lean();
    if (employeeData && employeeData.email) {
        await sendEmail({
            to: employeeData.email,
            subject: 'Your Document is Signed and Completed',
            html: `<p>Dear ${employeeData.fullName},</p><p>Your document (${title}) has been countersigned and is now complete. Please find the final signed copy attached.</p>`,
            text: `Your document (${title}) has been countersigned and is now complete.`,
            attachments: [
                {
                    filename: fileName,
                    path: outputPath,
                    contentType: 'application/pdf'
                }
            ]
        });
    }
  } catch (e) {
      console.error('Failed to send final PDF email', e);
  }

  return { doc: completed, fileUrl: publicUrl };
};

exports.listPendingForHr = async () => esignRepo.listPendingForHr();

exports.getAuditTrail = async ({ documentId }) => auditRepo.listByDocumentId(documentId);
