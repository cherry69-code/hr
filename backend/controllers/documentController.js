const Document = require('../models/Document');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const asyncHandler = require('../middlewares/asyncHandler');
const sendEmail = require('../utils/sendEmail');
const { getCompanyLogoBuffer } = require('../utils/branding');
const { generateOfferLetterPdf, generateJoiningAgreementPdf, generateDocumentHtml } = require('../services/documentGenerator.service');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// @desc    Generate and upload PDF
// @route   POST /api/documents/generate/:type/:employeeId
// @access  Private/Admin/HR
exports.generateAndUploadPDF = asyncHandler(async (req, res, next) => {
  const { type, employeeId } = req.params;

  // 1. Fetch employee
  const employee = await User.findById(employeeId).populate('departmentId').lean();

  if (!employee) {
    return res.status(404).json({ success: false, error: 'Employee not found' });
  }

  // 2. Generate PDF locally
  const fileName = `${type}_${employeeId}_${Date.now()}.pdf`;
  // Use /tmp for Render compatibility or fallback to utils
  const tempDir = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '../utils');
  if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch (err) {
        // If mkdir fails (e.g. permission), fallback to current dir
        console.error('Failed to create temp dir:', err);
      }
  }
  const filePath = path.join(tempDir, fileName);
  
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  const logoBuffer = await getCompanyLogoBuffer();
  let pageNo = 1;

  const addWatermark = () => {
    doc.save();
    doc.fillColor('#0F172A');
    doc.opacity(0.06);
    doc.rotate(-25, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.fontSize(80).font('Helvetica-Bold').text('PROP NINJA', 0, doc.page.height / 2 - 80, { align: 'center' });
    doc.opacity(1);
    doc.restore();
  };

  const addHeader = () => {
    const y = 30;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, y, { height: 32 });
      } catch {}
    } else {
      doc.fontSize(18).fillColor('#0F172A').text('PROP', 50, y, { continued: true });
      doc.fillColor('#16A34A').text('NINJA');
      doc.fillColor('black');
    }

    doc.moveTo(50, y + 44).lineTo(doc.page.width - 50, y + 44).strokeColor('#E2E8F0').stroke();
    doc.moveDown(2);
  };

  const addFooter = () => {
    const y = doc.page.height - 40;
    doc.fontSize(8).fillColor('#64748B').text('PropNinja HR • Confidential', 50, y, { align: 'left' });
    doc.fontSize(8).fillColor('#64748B').text(`Page ${pageNo}`, 50, y, { align: 'right' });
    doc.fillColor('black');
  };

  if (type === 'offer_letter') {
    // --- Page 1: Offer Letter ---
    addHeader();
    addWatermark();
    
    doc.moveDown(2);
    doc.fontSize(16).fillColor('black').text('OFFER LETTER', { align: 'center', underline: true });
    doc.moveDown();

    const today = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    doc.fontSize(10).font('Helvetica-Bold').text(`Date: ${today}`);
    doc.moveDown();

    doc.text('To');
    doc.text(`Ms./Mr. ${employee.fullName}`);
    doc.text(employee.address || 'Address not provided');
    doc.moveDown();

    doc.text('Sub: Offer Letter');
    doc.text(`Dear ${employee.fullName},`);
    doc.moveDown();

    doc.font('Helvetica').text(`We are pleased to offer you the post of ${employee.designation} based at Propninja consulting private limited. The compensation structure is enclosed for your reference as Annexure.`, { align: 'justify' });
    doc.moveDown();

    doc.text('Your employment with the Company will be subject to strict adherence to the policies and procedures of the Company. This offer is subjected to background verification and medical fitness.', { align: 'justify' });
    doc.moveDown();

    doc.text('On acceptance of the terms of conditions as per this offer letter, you will be able to terminate your employment with the Company by giving one month notice to the Company. You shall not be eligible to avail leave during the notice period.', { align: 'justify' });
    doc.moveDown();

    doc.text('We welcome you to join the Company and would be happy if you can sign the duplicate copy of this letter in token of your acceptance of the offer of employment with the Company.', { align: 'justify' });
    doc.moveDown();

    doc.text('If you have any question, please clarify from the undersigned.');
    doc.moveDown(2);

    doc.font('Helvetica-Bold').text('With regards,');
    doc.text('Team HR');
    doc.moveDown(3);

    doc.font('Helvetica').text('I accept the aforesaid terms & conditions and this offer of employment. I shall keep the contents of this document confidential.', { align: 'justify' });
    doc.moveDown();

    const joiningDate = employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-GB') : '________________';
    doc.font('Helvetica-Bold').text(`I will join on ${joiningDate}.`);
    doc.text(`Name: ${employee.fullName}`);
    doc.moveDown(2);

    doc.text('Signature: __________________________', { align: 'right' });
    doc.text(`${employee.fullName}`, { align: 'right' });

    // --- Page 2: Annexure ---
    addFooter();
    doc.addPage();
    pageNo += 1;
    addHeader();
    addWatermark();
    doc.moveDown(2);

    doc.fontSize(14).font('Helvetica-Bold').text('Annexure', { align: 'center' });
    doc.moveDown();

    // Calculate Salary Components (Annual & Monthly)
    const ctcAnnual = employee.salary?.ctc || 0;
    const ctcMonthly = Math.round(ctcAnnual / 12);

    const basicAnnual = Math.round(ctcAnnual * 0.5);
    const hraAnnual = Math.round(ctcAnnual * 0.2);
    const conveyanceAnnual = Math.round(ctcAnnual * 0.1);
    const specialAllowanceAnnual = Math.max(0, ctcAnnual - basicAnnual - hraAnnual - conveyanceAnnual);

    const basicMonthly = Math.round(basicAnnual / 12);
    const hraMonthly = Math.round(hraAnnual / 12);
    const convMonthly = Math.round(conveyanceAnnual / 12);
    const saMonthly = Math.round(specialAllowanceAnnual / 12);

    // Table
    const tableTop = 200;
    const col1 = 50;
    const col2 = 300;
    const col3 = 450;
    const rowHeight = 25;

    doc.fontSize(10);

    // Header Row
    doc.rect(col1, tableTop, 500, rowHeight).fillAndStroke('#cccccc', '#000000');
    doc.fillColor('black').font('Helvetica-Bold');
    doc.text('Components*', col1 + 10, tableTop + 8);
    doc.text('Monthly (INR)', col2 + 10, tableTop + 8);
    doc.text('Annual (INR)', col3 + 10, tableTop + 8);

    let y = tableTop + rowHeight;

    const drawRow = (label, monthly, annual) => {
        doc.rect(col1, y, 500, rowHeight).stroke();
        doc.font('Helvetica');
        doc.text(label, col1 + 10, y + 8);
        if (monthly !== '') doc.text(monthly.toString(), col2 + 10, y + 8);
        if (annual !== '') doc.text(annual.toString(), col3 + 10, y + 8);
        y += rowHeight;
    };

    drawRow('Basic', basicMonthly, basicAnnual);
    drawRow('HRA', hraMonthly, hraAnnual);
    drawRow('Special Allowance', saMonthly, specialAllowanceAnnual);
    drawRow('Conveyance', convMonthly, conveyanceAnnual);
    drawRow('Medical', '', '');
    drawRow('LTA', '', '');
    drawRow('PF (Employer Contribution)', '', '');
    drawRow('Bonus (Annual)', '', '');
    
    // Total Row
    drawRow('Total', '', ''); // Can sum up if needed, example shows empty

    // CTC Row
    doc.font('Helvetica-Bold');
    drawRow('CTC', ctcMonthly, ctcAnnual);

    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica-Oblique').text('* - The components can vary depending on the company and the way it would want to structure the salary.', col1, y + 10);

    // Footer Signature
    doc.moveDown(10);
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Signature: __________________________', { align: 'right' });
    doc.text(`${employee.fullName}`, { align: 'right' });

    addFooter();
  } else {
    // Default / Joining Letter (keep simple for now)
    addHeader();
    addWatermark();
    doc.fontSize(20).text(type.replace('_', ' ').toUpperCase(), { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.text(`Employee: ${employee.fullName}`);
    doc.text(`Designation: ${employee.designation}`);
    doc.text(`Department: ${employee.departmentId?.name || 'N/A'}`);
    doc.moveDown();
    doc.text(`This is a computer-generated ${type.replace('_', ' ')} for ${employee.fullName}.`);
    addFooter();
  }

  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  // 3. Upload to Cloudinary
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    folder: 'documents',
    public_id: fileName
  });

  // 4. Save to DB
  const document = await Document.create({
    employeeId: employee._id,
    type,
    url: result.secure_url,
    uploadedBy: req.user.id
  });

  // Update User profile with the document link
  const updateField = {};
  // Map 'offer_letter' -> 'offerLetter' for schema consistency if needed
  // Frontend sends 'offer_letter' in params but schema has 'offerLetter'
  let schemaKey = type;
  if (type === 'offer_letter') schemaKey = 'offerLetter';
  if (type === 'joining_letter') schemaKey = 'joiningLetter';

  updateField[`documents.${schemaKey}`] = {
    url: result.secure_url,
    uploadedAt: Date.now()
  };

  await User.findByIdAndUpdate(employeeId, { $set: updateField });

  // 5. Cleanup local file
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.status(201).json({ success: true, data: document });
});

// @desc    Upload document (Base64)
// @route   POST /api/documents/upload
// @access  Private/Admin/HR
exports.uploadDocument = asyncHandler(async (req, res, next) => {
  const { employeeId, type, file } = req.body;

  if (!employeeId || !type || !file) {
    return res.status(400).json({ success: false, error: 'Please provide employeeId, type, and file' });
  }

  // Validate Employee ID format
  if (!employeeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid Employee ID format' });
  }

  // Basic file validation (expects data URL)
  if (typeof file === 'string') {
    // Check for valid Data URL structure
    const mimeMatch = file.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    if (!mimeMatch) {
      return res.status(400).json({ success: false, error: 'Invalid file format' });
    }

    const mimeType = mimeMatch[1];
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ success: false, error: 'Invalid file type. Only PDF, JPG, PNG allowed.' });
    }

    // Rough size check (base64 length ~1.37x real size). Limit ~10MB
    const base64Data = file.replace(/^data:.+;base64,/, '');
    const approxBytes = Math.floor(base64Data.length * 0.75);
    if (approxBytes > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File too large (max 10MB)' });
    }
  }

  // Upload to Cloudinary
  let result;
  try {
    result = await cloudinary.uploader.upload(file, {
      folder: 'documents',
      resource_type: 'auto'
    });
  } catch (err) {
    console.error('Cloudinary Upload Failed:', err);
    return res.status(500).json({ success: false, error: 'File upload failed' });
  }

  // Update User model directly for standard docs
  const updateField = {};
  // Map frontend types to schema keys if needed, but they should match
  // Schema keys: aadhar, pan, degreeCertificate, photo, offerLetter, joiningLetter
  
  // Ensure we update the nested field correctly
  updateField[`documents.${type}`] = {
    url: result.secure_url,
    uploadedAt: Date.now()
  };

  const user = await User.findByIdAndUpdate(employeeId, {
    $set: updateField
  }, { new: true });

  // Check if all required documents are present
  const docs = user.documents || {};
  
  // Mandatory documents as per new requirement: PAN, Aadhar, Degree Certificate
  const required = ['pan', 'aadhar', 'degreeCertificate'];
  
  // Check if every required document exists and has a URL
  const allPresent = required.every(key => docs[key] && docs[key].url);

  // Trigger Offer Letter if all docs are present AND status is DOCUMENT_PENDING
  // (Or if status is roughly correct, to allow re-trigger if failed before)
  if (allPresent && (user.status === 'DOCUMENT_PENDING' || user.status === 'active')) {
    
    // Only generate if not already generated/sent
    const existingOffer = await Document.findOne({ employeeId, type: 'offer_letter' });
    
    if (!existingOffer) {
        user.status = 'DOCUMENTS_UPLOADED';
        await user.save();
        
        // Auto-generate Offer Letter
        try {
           await exports.autoGenerateOfferLetter(user, req.user.id);
        } catch (err) {
           console.error('Auto-generation of Offer Letter failed:', err);
        }
    }
  }

  res.status(200).json({ success: true, data: user, url: result.secure_url });
});

const os = require('os');

exports.autoGenerateOfferLetter = async (user, hrId) => {
    // 1. Prepare file path
    const fileName = `offer_letter_${user._id}_${Date.now()}.pdf`;
    
    // Use system temp directory for reliability
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, fileName);

    // 2. Generate PDF
    // Populate necessary fields for template
    const employee = await User.findById(user._id).populate('departmentId').populate('teamId').lean();
    
    try {
        await generateOfferLetterPdf(employee, filePath);
    } catch (pdfErr) {
        console.error('PDF Generation Error:', pdfErr);
        throw pdfErr; // Re-throw to be caught by caller
    }

    // 3. Upload to Cloudinary
    let pdfUrl = '';
    try {
        const uploaded = await cloudinary.uploader.upload(filePath, {
            resource_type: 'raw',
            folder: 'documents',
            public_id: fileName
        });
        pdfUrl = uploaded.secure_url;
    } catch (e) {
        console.error('Cloudinary upload failed (PDF):', e);
        // Don't throw, just log. But we can't save URL.
    }

    // 4. Create Document Record
    if (pdfUrl) {
        await Document.create({
            employeeId: user._id,
            type: 'offer_letter',
            url: pdfUrl,
            status: 'PendingSignature', // Ready to be sent
            uploadedBy: hrId
        });

        // Update User
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'documents.offerLetter': { url: pdfUrl, uploadedAt: Date.now() },
                status: 'OFFER_LETTER_PENDING'
            }
        });
    } else {
        console.error('Failed to upload Offer Letter PDF to Cloudinary');
    }
    
    // Cleanup
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

exports.sendOfferLetterToCandidate = asyncHandler(async (req, res) => {
  const {
    employeeId, // Support employeeId directly
    fullName,
    fatherName,
    email,
    salutation,
    address,
    designation,
    departmentId,
    teamId,
    joiningDate,
    ctc,
    panNumber,
    aadharNumber,
    hrSignature // New Field
  } = req.body;

  // 1. Find User
  let user = null;
  if (employeeId) {
      user = await User.findById(employeeId);
  } else if (email) {
      user = await User.findOne({ email });
  }

  // Validation if creating new user
  if (!user && (!fullName || !email || !designation)) {
    return res.status(400).json({ success: false, error: 'Please provide fullName, email and designation for new candidate' });
  }

  // 2. Check for Existing Sent/Signed Document
  if (user) {
    const existingDoc = await Document.findOne({
      employeeId: user._id,
      type: 'offer_letter',
      status: { $in: ['EmployeeSigned', 'Completed'] } // Allow resending if 'Sent' or 'PendingSignature'
    });

    if (existingDoc) {
      return res.status(400).json({ 
        success: false, 
        error: `An Offer Letter has already been signed/completed (Status: ${existingDoc.status}).` 
      });
    }
  }

  // 3. Create or Update User
  const update = {};
  if (fullName) update.fullName = fullName;
  if (email) update.email = email;
  if (address) update.address = address;
  if (designation) update.designation = designation;
  if (joiningDate) update.joiningDate = joiningDate;
  if (departmentId) update.departmentId = departmentId;
  if (teamId) update.teamId = teamId;
  if (ctc !== undefined && ctc !== null && ctc !== '') update['salary.ctc'] = Number(ctc);
  const { encryptField } = require('../utils/fieldCrypto');
  if (panNumber) update['personalDetails.panNumber'] = encryptField(panNumber);
  if (aadharNumber) update['personalDetails.aadharNumber'] = encryptField(aadharNumber);
  if (fatherName) update['personalDetails.fatherName'] = fatherName;
  update.companyId = req.user.companyId || 'propninja';

  if (!user) {
    const randomPassword = crypto.randomBytes(12).toString('hex');
    user = await User.create({
      fullName,
      email,
      password: randomPassword,
      role: 'employee',
      level: 'N0',
      status: 'inactive',
      address: address || '',
      designation,
      departmentId: departmentId || undefined,
      teamId: teamId || undefined,
      joiningDate: joiningDate || undefined,
      salary: { ctc: Number(ctc || 0) },
      personalDetails: {
        panNumber: panNumber ? encryptField(panNumber) : '',
        aadharNumber: aadharNumber ? encryptField(aadharNumber) : '',
        fatherName: fatherName || ''
      },
      companyId: req.user.companyId || 'propninja'
    });
  } else {
    // Only update fields provided
    await User.findByIdAndUpdate(user._id, { $set: update });
  }

  const employee = await User.findById(user._id).populate('departmentId').populate('teamId').lean();
  if (!employee) {
    return res.status(500).json({ success: false, error: 'Failed to find candidate' });
  }

  // 4. Check for PendingSignature or Sent Document
  let doc = await Document.findOne({
      employeeId: employee._id,
      type: 'offer_letter',
      status: { $in: ['PendingSignature', 'Sent'] }
  });

  let pdfUrl = doc ? doc.url : '';
  let token = doc ? doc.token : '';

  // If no existing doc, generate one
  if (!doc) {
      const fileName = `offer_letter_${employee._id}_${Date.now()}.pdf`;
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, fileName);

      try {
        await generateOfferLetterPdf(employee, filePath);
        const uploaded = await cloudinary.uploader.upload(filePath, {
          resource_type: 'raw',
          folder: 'documents',
          public_id: fileName
        });
        pdfUrl = uploaded.secure_url;
      } catch (e) {
        console.error('PDF Generation/Upload Failed:', e);
        // Continue if possible? No, we need PDF.
        if (!pdfUrl) return res.status(500).json({ success: false, error: 'Failed to generate/upload Offer Letter' });
      }

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      
      // Create Document
      token = crypto.randomBytes(32).toString('hex');
      doc = await Document.create({
        employeeId: employee._id,
        type: 'offer_letter',
        url: pdfUrl,
        token,
        status: 'Sent',
        uploadedBy: req.user.id
      });
  } else {
      // Reuse existing document
      if (!token) {
          token = crypto.randomBytes(32).toString('hex');
          doc.token = token;
      }
      doc.status = 'Sent';
      doc.tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await doc.save();
  }

  // Update User Status
  await User.findByIdAndUpdate(employee._id, {
    $set: {
      'documents.offerLetter': { url: pdfUrl, uploadedAt: Date.now() },
      status: 'OFFER_LETTER_PENDING' // Ensure status is correct
    }
  });

  // 5. Send Email
  const signingLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/sign/${token}`;
  let emailSent = false;
  let emailError = '';
  
  try {
    await sendEmail({
      email: employee.email,
      subject: 'FINAL OFFER LETTER FROM PRONINJA CONSULTING PRIVATE LIMITED',
      message: `Please review and sign your offer letter here: ${signingLink}`,
      html: `
        <p>Dear ${employee.fullName},</p>
        <p>Please find attached your offer letter.</p>
        <p>You are required to digitally sign it using the link below.</p>
        <p><a href="${signingLink}" style="background-color: #16A34A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Sign Offer Letter</a></p>
        ${pdfUrl ? `<p>You can also download the PDF copy here: <a href="${pdfUrl}">${pdfUrl}</a></p>` : ''}
        <p>Regards,<br/>Team HR</p>
      `
      // Attachments handled by link usually, but if we have local file... we deleted it.
      // So no attachment, just link.
    });
    emailSent = true;
  } catch (e) {
    emailSent = false;
    emailError = e && e.message ? e.message : 'Email could not be sent';
  }

  res.status(200).json({
    success: true,
    data: {
      employeeId: employee._id,
      emailSent,
      pdfUrl,
      emailError
    }
  });
});

exports.sendJoiningAgreementToCandidate = asyncHandler(async (req, res) => {
  const {
    employeeId,
    fullName,
    fatherName,
    email,
    salutation,
    address,
    designation,
    departmentId,
    teamId,
    joiningDate,
    ctc,
    panNumber,
    aadharNumber,
    hrSignature // New Field
  } = req.body;

  // 1. Find User
  let user = null;
  if (employeeId) {
      user = await User.findById(employeeId);
  } else if (email) {
      user = await User.findOne({ email });
  }

  if (!user && (!fullName || !email || !designation)) {
    return res.status(400).json({ success: false, error: 'Please provide fullName, email and designation' });
  }

  // 2. Check for Existing Document
  if (user) {
    const existingDoc = await Document.findOne({
      employeeId: user._id,
      type: { $in: ['joining_agreement', 'joining_letter'] },
      status: { $in: ['EmployeeSigned', 'Completed'] } // Allow resending if 'Sent'
    });

    if (existingDoc) {
      return res.status(400).json({ 
        success: false, 
        error: `A Joining Agreement has already been signed/completed (Status: ${existingDoc.status}).` 
      });
    }
  }

  // 3. Create or Update User
  const update = {};
  if (fullName) update.fullName = fullName;
  if (email) update.email = email;
  if (address) update.address = address;
  if (designation) update.designation = designation;
  if (joiningDate) update.joiningDate = joiningDate;
  if (departmentId) update.departmentId = departmentId;
  if (teamId) update.teamId = teamId;
  if (ctc !== undefined && ctc !== null && ctc !== '') update['salary.ctc'] = Number(ctc);
  if (panNumber) update['personalDetails.panNumber'] = panNumber;
  if (aadharNumber) update['personalDetails.aadharNumber'] = aadharNumber;
  if (fatherName) update['personalDetails.fatherName'] = fatherName;

  if (!user) {
    const randomPassword = crypto.randomBytes(12).toString('hex');
    user = await User.create({
      fullName,
      email,
      password: randomPassword,
      role: 'employee',
      level: 'N0',
      status: 'inactive',
      address: address || '',
      designation,
      departmentId: departmentId || undefined,
      teamId: teamId || undefined,
      joiningDate: joiningDate || undefined,
      salary: { ctc: Number(ctc || 0) },
      personalDetails: {
        panNumber: panNumber || '',
        aadharNumber: aadharNumber || '',
        fatherName: fatherName || ''
      }
    });
  } else {
    await User.findByIdAndUpdate(user._id, { $set: update });
  }

  const employee = await User.findById(user._id).populate('departmentId').populate('teamId').lean();
  if (!employee) {
    return res.status(500).json({ success: false, error: 'Failed to create candidate' });
  }

  // 4. Check for PendingSignature or Sent Document
  let document = await Document.findOne({
      employeeId: employee._id,
      type: { $in: ['joining_agreement', 'joining_letter'] },
      status: { $in: ['PendingSignature', 'Sent'] }
  });

  let token = document ? document.token : '';

  if (!document) {
      // Generate New (PDF-based)
      // We reuse autoGenerateJoiningLetter logic logic but adapted for manual send
      // Or just create HTML based if PDF gen is complex here.
      // Let's create PDF for consistency.
      const fileName = `joining_letter_${employee._id}_${Date.now()}.pdf`;
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, fileName);

      // We need a generateJoiningLetterPdf function. 
      // Assuming generic logic or simple one.
      // For now, let's create a simple PDF manually here if not using service.
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);
      doc.fontSize(20).text('JOINING LETTER', { align: 'center' });
      doc.moveDown();
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.text(`Dear ${employee.fullName},`);
      doc.text('Welcome to the team! Please sign this agreement.');
      doc.end();

      await new Promise((resolve) => writeStream.on('finish', resolve));

      let pdfUrl = '';
      try {
        const uploaded = await cloudinary.uploader.upload(filePath, {
          resource_type: 'raw',
          folder: 'documents',
          public_id: fileName
        });
        pdfUrl = uploaded.secure_url;
      } catch (e) {
         console.error('Cloudinary upload failed', e);
      }

      token = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;

      document = await Document.create({
        employeeId: employee._id,
        type: 'joining_letter', // Use joining_letter for consistency
        token,
        tokenExpiry,
        url: pdfUrl,
        status: 'Sent',
        hrSignature,
        hrSignedAt: hrSignature ? Date.now() : undefined,
        uploadedBy: req.user.id
      });
      
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } else {
      // Reuse existing
      if (!token) {
          token = crypto.randomBytes(32).toString('hex');
          document.token = token;
      }
      document.status = 'Sent';
      document.tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await document.save();
  }

  // Update User Status
  await User.findByIdAndUpdate(employee._id, {
    $set: {
      'documents.joiningLetter': { url: document.url, uploadedAt: Date.now() },
      status: 'JOINING_LETTER_PENDING'
    }
  });

  const signingLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/sign/${token}`;

  let emailSent = false;
  let emailError = '';
  try {
    await sendEmail({
      email: employee.email,
      subject: 'Action Required: Sign Joining Agreement - PropNinja',
      message: `Please sign your joining agreement here: ${signingLink}`,
      html: `
        <p>Dear ${employee.fullName},</p>
        <p>Please click the link below to review and sign your Joining Agreement.</p>
        <p><a href="${signingLink}" style="background-color: #16A34A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Sign Document</a></p>
        <p>This link expires in 7 days.</p>
        <p>Regards,<br/>Team HR</p>
      `
    });
    emailSent = true;
  } catch (e) {
    emailSent = false;
    emailError = e && e.message ? e.message : 'Email could not be sent';
  }

  res.status(200).json({
    success: true,
    data: {
      employeeId: employee._id,
      emailSent,
      token, // Return token for debug/testing
      emailError
    }
  });
});

// @desc    Sign document (Public/Token)
// @route   POST /api/documents/sign-public/:token
// @access  Public
exports.signAndSendDocument = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { signatureData } = req.body; // Base64 signature image

  // 1. Find Document by token
  const document = await Document.findOne({ 
    token, 
    tokenExpiry: { $gt: Date.now() },
    status: { $in: ['Sent', 'PendingSignature'] } 
  });

  if (!document) {
    return res.status(400).json({ success: false, error: 'Invalid or expired token' });
  }

  // 2. Update Document
  document.status = 'EmployeeSigned'; 
  document.employeeSignature = signatureData;
  document.employeeSignedAt = Date.now();
  document.employeeIP = req.ip;
  document.token = undefined; 
  await document.save();

  // 3. Update User Status & Trigger Next Step
  const user = await User.findById(document.employeeId);
  if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (document.type === 'offer_letter') {
      user.status = 'OFFER_LETTER_SIGNED';
      if (user.documents && user.documents.offerLetter) user.documents.offerLetter.signed = true;
      await user.save();
      
      // Trigger Joining Letter
      try {
          await exports.autoGenerateJoiningLetter(user);
      } catch (err) {
          console.error('Auto-generation of Joining Letter failed:', err);
      }
  } else if (document.type === 'joining_letter' || document.type === 'joining_agreement') {
      user.status = 'active'; // Activate Account (Step 8)
      document.status = 'Completed'; 
      await document.save();
      
      if (document.type === 'joining_letter' && user.documents.joiningLetter) user.documents.joiningLetter.signed = true;
      if (document.type === 'joining_agreement' && user.documents.joiningAgreement) user.documents.joiningAgreement.signed = true;
      await user.save();
      
      // Send Credentials
      try {
          await exports.sendAccountActivationEmail(user);
      } catch (err) {
          console.error('Activation email failed:', err);
      }
  }

  res.status(200).json({ success: true, message: 'Document signed successfully' });
});

exports.autoGenerateJoiningLetter = async (user) => {
    // 1. Prepare file path
    const fileName = `joining_letter_${user._id}_${Date.now()}.pdf`;
    const tempDir = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '../utils');
    if (!fs.existsSync(tempDir)) {
        try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}
    }
    const filePath = path.join(tempDir, fileName);

    // 2. Generate PDF
    const employee = await User.findById(user._id).populate('departmentId').populate('teamId').lean();
    // Assuming generateJoiningAgreementPdf exists or using generic
    // Using generic generateAndUploadPDF logic but adapted
    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    doc.fontSize(20).text('JOINING LETTER', { align: 'center' });
    doc.moveDown();
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Dear ${employee.fullName},`);
    doc.text('Welcome to the team!');
    doc.end();

    await new Promise((resolve) => writeStream.on('finish', resolve));

    // 3. Upload to Cloudinary
    let pdfUrl = '';
    try {
        const uploaded = await cloudinary.uploader.upload(filePath, {
            resource_type: 'raw',
            folder: 'documents',
            public_id: fileName
        });
        pdfUrl = uploaded.secure_url;
    } catch (e) { console.error(e); }

    // 4. Create Document Record
    if (pdfUrl) {
        const token = crypto.randomBytes(32).toString('hex');
        await Document.create({
            employeeId: user._id,
            type: 'joining_letter',
            url: pdfUrl,
            status: 'PendingSignature',
            token,
            tokenExpiry: Date.now() + 7 * 24 * 60 * 60 * 1000
        });

        // Update User
        await User.findByIdAndUpdate(user._id, {
            $set: {
                'documents.joiningLetter': { url: pdfUrl, uploadedAt: Date.now() },
                status: 'JOINING_LETTER_PENDING'
            }
        });

        // Email Link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        const signingLink = `${frontendUrl}/sign/${token}`;
        await sendEmail({
            to: user.email,
            subject: 'Action Required: Sign Joining Letter',
            html: `<p>Please sign your Joining Letter: <a href="${signingLink}">${signingLink}</a></p>`
        });
    }
    
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

exports.sendAccountActivationEmail = async (user) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const loginUrl = `${frontendUrl}/login`;
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
};

// @desc    Get all documents for an employee
// @route   GET /api/documents/:employeeId
// @access  Private
exports.getDocuments = asyncHandler(async (req, res, next) => {
  const documents = await Document.find({ employeeId: req.params.employeeId });

  res.status(200).json({
    success: true,
    count: documents.length,
    data: documents
  });
});
