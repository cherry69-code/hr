const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getCompanyLogoBuffer } = require('../utils/branding');
const DocumentTemplate = require('../models/DocumentTemplate');

// Helper to get template content from DB or File
const getTemplateContent = async (type) => {
  // 1. Try DB first
  const template = await DocumentTemplate.findOne({ type });
  if (template && template.content) {
    return template.content;
  }

  // 2. Fallback to file
  let fileName = '';
  if (type === 'joining_agreement') fileName = 'joining_agreement_content.txt';
  if (type === 'joining_letter') fileName = 'joining_letter_content.txt';
  if (type === 'offer_letter') fileName = 'offer_letter_content.txt';
  
  if (!fileName) return '';

  const filePath = path.join(__dirname, '../templates', fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  return ''; // Return empty if nothing found
};

const dataUrlToBuffer = (dataUrl) => {
  if (!dataUrl) return null;
  const matches = dataUrl.match(/^data:.+\/(.+);base64,(.*)$/);
  if (!matches || matches.length !== 3) {
    return null; // Invalid data URL
  }
  return Buffer.from(matches[2], 'base64');
};

const addWatermark = (doc, logoBuffer) => {
  doc.save();
  doc.fillColor('#0F172A');
  doc.opacity(0.1); // Increased opacity for better visibility
  
  // Center of the page
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2;
  
  if (logoBuffer) {
    try {
        // Draw image centered without rotation
        doc.image(logoBuffer, centerX - 150, centerY - 150, { width: 300 });
    } catch {
        doc.fontSize(80).font('Helvetica-Bold').text('PROP NINJA', 0, centerY - 80, { align: 'center' });
    }
  } else {
    doc.fontSize(80).font('Helvetica-Bold').text('PROP NINJA', 0, centerY - 80, { align: 'center' });
  }
  
  doc.opacity(1);
  doc.restore();
};

const addHeader = (doc, logoBuffer) => {
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

const addFooter = (doc, pageNo) => {
  const y = doc.page.height - 40;
  
  // Custom Footer Design (Geometric)
  doc.save();
  
  // Red Chevron
  doc.path('M 0 842 L 50 842 L 80 812 L 30 812 Z')
     .fillColor('#DC2626') // Red
     .fill();
     
  // Blue Bar
  doc.rect(50, 832, doc.page.width - 50, 10)
     .fillColor('#1E3A8A') // Dark Blue
     .fill();

  doc.restore();

  doc.fontSize(8).fillColor('#64748B').text('PropNinja HR • Confidential', 50, y - 10, { align: 'left' });
  doc.fontSize(8).fillColor('#64748B').text(`Page ${pageNo}`, 50, y - 10, { align: 'right' });
  doc.fillColor('black');
};

const drawSalaryTable = (doc, employee) => {
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
    const tableTop = doc.y;
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
};

exports.generateFinalPdfWithSignatures = async (document, filePath) => {
  const { type, employeeId: employee, employeeSignature, hrSignature } = document;
  const signatures = {
    employeeSignature,
    hrSignature
  };

  if (type === 'offer_letter') {
    return await exports.generateOfferLetterPdf(employee, filePath, signatures);
  } else if (type === 'joining_agreement') {
    return await exports.generateJoiningAgreementPdf(employee, filePath, signatures);
  } else {
    throw new Error(`Unsupported document type: ${type}`);
  }
};

exports.generateOfferLetterPdf = async (employee, filePath, signatures = {}) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  const logoBuffer = await getCompanyLogoBuffer();
  let pageNo = 1;

  // Helper to add new page
  const checkPageBreak = () => {
    if (doc.y > doc.page.height - 100) {
      addFooter(doc, pageNo);
      doc.addPage();
      pageNo += 1;
      addHeader(doc, logoBuffer);
      addWatermark(doc, logoBuffer);
      doc.moveDown(2);
    }
  };

  // --- Page 1 ---
  addHeader(doc, logoBuffer);
  addWatermark(doc, logoBuffer);
  
  // Read content from template system (DB or File)
  let offerContent = await getTemplateContent('offer_letter');
  const today = new Date().toLocaleDateString('en-GB');
  const joinDt = employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-GB') : '________________';
  const signingDate = signatures.employeeSignature ? new Date().toLocaleDateString('en-GB') : '________________';
  const salutationText = employee.salutation || 'Ms./Mr.';
  const { decryptField } = require('../utils/fieldCrypto');

  if (offerContent) {
    // Replace placeholders
    offerContent = offerContent.replace(/{{fullName}}/g, employee.fullName);
    offerContent = offerContent.replace(/{{designation}}/g, employee.designation);
    offerContent = offerContent.replace(/{{joiningDate}}/g, joinDt);
    offerContent = offerContent.replace(/{{signingDate}}/g, signingDate);
    offerContent = offerContent.replace(/{{ctc}}/g, employee.salary?.ctc || 0);
    offerContent = offerContent.replace(/{{address}}/g, employee.address || 'Address not provided');
    offerContent = offerContent.replace(/{{email}}/g, employee.email);
    offerContent = offerContent.replace(/{{today}}/g, today);
    offerContent = offerContent.replace(/{{salutation}}/g, salutationText);
    const aad = employee.personalDetails?.aadharNumber;
    const pan = employee.personalDetails?.panNumber;
    offerContent = offerContent.replace(/{{aadharNumber}}/g, aad ? decryptField(aad) : '________________');
    offerContent = offerContent.replace(/{{panNumber}}/g, pan ? decryptField(pan) : '________________');
    offerContent = offerContent.replace(/{{employeeId}}/g, employee.employeeId || '________________');
  } else {
    // Fallback if template fails
    offerContent = `OFFER LETTER\n\nDate: ${today}\n\nTo\n${salutationText} ${employee.fullName}\n${employee.address || 'Address not provided'}\n\nSub: Offer Letter\n\nDear ${employee.fullName},\n\nWe are pleased to offer you the post of ${employee.designation} based at Propninja consulting private limited. The compensation structure is enclosed for your reference as Annexure.`;
  }

  // Check if custom signature placeholders exist in content
  const hasHrSigPlaceholder = offerContent.includes('{{hrSignature}}');
  const hasEmpSigPlaceholder = offerContent.includes('{{employeeSignature}}');

  // Render Content
  const lines = offerContent.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      // checkPageBreak(); // DISABLED to force content on first page if possible
      
      // Check for Custom Signature Placeholders
      if (line.includes('{{hrSignature}}')) {
          if (signatures.hrSignature) {
            const hrSigBuffer = dataUrlToBuffer(signatures.hrSignature);
            if (hrSigBuffer) {
                doc.image(hrSigBuffer, 50, doc.y, { width: 100 });
                doc.fontSize(8).text('Digitally Signed by HR', 50, doc.y + 60);
            }
          } else {
            doc.fontSize(10).text('(HR Signature)', 50, doc.y + 20);
          }
          doc.moveDown(4); // Advance past signature block
          continue; // Skip printing the placeholder text itself
      }

      if (line.includes('{{employeeSignature}}')) {
          if (signatures.employeeSignature) {
            const empSigBuffer = dataUrlToBuffer(signatures.employeeSignature);
            if (empSigBuffer) {
                doc.image(empSigBuffer, doc.page.width - 200, doc.y, { width: 100 });
                doc.fontSize(8).text(`Digitally Signed by ${employee.fullName}`, doc.page.width - 200, doc.y + 60, { align: 'left' });
            }
          } else {
            doc.fontSize(10).text('(Employee Signature)', doc.page.width - 200, doc.y + 20);
          }
          doc.moveDown(4); // Advance past signature block
          continue;
      }

      // Simple heuristic for formatting
      if (line.trim().toUpperCase() === 'OFFER LETTER') {
        doc.fontSize(16).fillColor('black').text('OFFER LETTER', { align: 'center', underline: true });
      } else if (line.trim().startsWith('Date:') || line.trim().startsWith('Sub:') || line.trim().startsWith('Dear')) {
        doc.fontSize(10).font('Helvetica-Bold').text(line.trim());
      } else {
        doc.fontSize(10).font('Helvetica').text(line.trim(), { align: 'justify' });
      }
      doc.moveDown(0.5);
    }
  }

  // Only render default signature block if placeholders were NOT found
  if (!hasHrSigPlaceholder && !hasEmpSigPlaceholder) {
      // Ensure signatures fit on the first page if possible
      if (doc.y > doc.page.height - 150) {
          doc.addPage();
          pageNo += 1;
          addHeader(doc, logoBuffer);
          addWatermark(doc, logoBuffer);
          doc.moveDown(2);
      } else {
          doc.moveDown(2);
      }
      
      // Signatures
      doc.fontSize(10).font('Helvetica-Bold');
      
      // HR Signature
      if (signatures.hrSignature) {
        const hrSigBuffer = dataUrlToBuffer(signatures.hrSignature);
        if (hrSigBuffer) {
            doc.image(hrSigBuffer, 50, doc.y, { width: 100 });
            doc.text('Digitally Signed by HR', 50, doc.y + 60);
        }
      } else {
        // Placeholder if not yet signed
        doc.text('Digitally Signed by HR', 50, doc.y + 60);
      }

      doc.text('Signature: __________________________', { align: 'right' });
      // Employee Signature
      if (signatures.employeeSignature) {
        const empSigBuffer = dataUrlToBuffer(signatures.employeeSignature);
        if (empSigBuffer) {
            doc.image(empSigBuffer, doc.page.width - 200, doc.y - 50, { width: 100 });
            doc.text(`Digitally Signed by ${employee.fullName}`, { align: 'right' });
        }
      } else {
        // Placeholder if not yet signed
        doc.text(`${employee.fullName}`, { align: 'right' });
      }
  }

  addFooter(doc, pageNo);

  // --- Page 2: Annexure ---
  doc.addPage();
  pageNo += 1;
  addHeader(doc, logoBuffer);
  addWatermark(doc, logoBuffer);
  doc.moveDown(2);

  doc.fontSize(14).font('Helvetica-Bold').text('Annexure', { align: 'center' });
  doc.moveDown();

  drawSalaryTable(doc, employee);
  
  addFooter(doc, pageNo);
  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

exports.generateJoiningAgreementPdf = async (employee, filePath, signatures = {}) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  const logoBuffer = await getCompanyLogoBuffer();
  let pageNo = 1;

  // Helper to add new page
  const checkPageBreak = () => {
    if (doc.y > doc.page.height - 100) {
      addFooter(doc, pageNo);
      doc.addPage();
      pageNo += 1;
      addHeader(doc, logoBuffer);
      addWatermark(doc, logoBuffer);
      doc.moveDown(2);
    }
  };

  // --- Page 1 ---
  addHeader(doc, logoBuffer);
  addWatermark(doc, logoBuffer);
  
  doc.moveDown(2);
  doc.fontSize(14).font('Helvetica-Bold').text('EMPLOYMENT AGREEMENT', { align: 'center', underline: true });
  doc.moveDown();

  const salutationText = employee.salutation || 'Ms./Mr.';
  const joinDt = employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : '________________';
  const signingDate = signatures.employeeSignature ? new Date().toLocaleDateString('en-GB') : '________________';
  const ctc = employee.salary?.ctc || 0;
  const fatherName = employee.personalDetails?.fatherName || '________________';
  const address = employee.address || '________________';
  const designation = employee.designation || '________________';

  // Parties
  doc.fontSize(10).font('Helvetica').text('THIS AGREEMENT is made', { align: 'left' });
  doc.font('Helvetica-Bold').text('BETWEEN');
  doc.font('Helvetica').text('PropNinja Consulting Pvt. Ltd.');
  doc.text('A Company incorporated under Companies Act, 1956 in the Republic of India and having its Registered office 1685 6th main 7th cross hampinagar vijaynagar bangalore 560104 (hereinafter called "the Company" which expression shall include its associated Companies, successors and assigns) of the one part;', { align: 'justify' });
  
  doc.moveDown();
  doc.font('Helvetica-Bold').text('AND');
  doc.moveDown();

  doc.font('Helvetica-Bold').text(`${salutationText} ${employee.fullName}`);
  doc.font('Helvetica').text(`D/O ${fatherName}, ${address} (herein after referred to as the "the Employee" which expression shall include its successors and assigns) of the other part;`);
  
  doc.moveDown();
  doc.text(`It is agreed that the Company will employ ${salutationText} ${employee.fullName} as ${designation} of the Company on the particulars/ terms and conditions as laid down in the Annexure A to this Agreement appended here to, and on terms and conditions as enumerated hereinafter in this Agreement:`, { align: 'justify' });
  doc.moveDown();

  // Read content from template system (DB or File)
  let agreementContent = await getTemplateContent('joining_agreement');

  if (agreementContent) {
    // Replace placeholders
    agreementContent = agreementContent.replace(/{{fullName}}/g, employee.fullName);
    agreementContent = agreementContent.replace(/{{designation}}/g, employee.designation);
    agreementContent = agreementContent.replace(/{{joiningDate}}/g, joinDt);
    agreementContent = agreementContent.replace(/{{signingDate}}/g, signingDate);
    agreementContent = agreementContent.replace(/{{ctc}}/g, employee.salary?.ctc || 0);
    agreementContent = agreementContent.replace(/{{address}}/g, employee.address || '');
    agreementContent = agreementContent.replace(/{{email}}/g, employee.email);
    agreementContent = agreementContent.replace(/{{fatherName}}/g, employee.personalDetails?.fatherName || '');
    const aad = employee.personalDetails?.aadharNumber;
    const pan = employee.personalDetails?.panNumber;
    agreementContent = agreementContent.replace(/{{aadharNumber}}/g, aad ? decryptField(aad) : '________________');
    agreementContent = agreementContent.replace(/{{panNumber}}/g, pan ? decryptField(pan) : '________________');
    agreementContent = agreementContent.replace(/{{employeeId}}/g, employee.employeeId || '________________');
  } else {
    // Fallback hardcoded content
    agreementContent = `
1. DEFINITIONS AND INTERPRETATIONS
1.1. In this agreement the following words and phrases shall bear the meanings respectively ascribed to them, that is to say:
a) "the Particulars" means the particulars incorporated in under the agreement as varied time to time as agreed by the parties to the agreement
b) "the Employee" means the individual defined under specific labour laws applying particularly to the company like Employee State Insurance Act, 1948.
c) "the Company" means a company registered under Companies Act ,1956 or Companies Act, 2013 named as PropNinja Consulting Pvt. Ltd. also includes its associated companies etc.
d) "the Associated Company" means a subsidiary and any other Company which is for the time being a holding Company of the Company
e) "Financial Year" means the financial year which shall run from the 1st day of April to the 31st day of March every year.
f) "Calendar Year" means the calendar year which shall run from the 1st day of January to the 31st day of December every year.
g) "Month" means a calendar month
`;
  }

  // Check if custom signature placeholders exist in content
  const hasHrSigPlaceholder = agreementContent.includes('{{hrSignature}}');
  const hasEmpSigPlaceholder = agreementContent.includes('{{employeeSignature}}');

  // Render Content
  const lines = agreementContent.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      checkPageBreak();
      
      // Check for Custom Signature Placeholders
      if (line.includes('{{hrSignature}}')) {
          if (signatures.hrSignature) {
            const hrSigBuffer = dataUrlToBuffer(signatures.hrSignature);
            if (hrSigBuffer) {
                doc.image(hrSigBuffer, 50, doc.y, { width: 100 });
                doc.fontSize(8).text('Digitally Signed by HR', 50, doc.y + 60);
            }
          } else {
            doc.fontSize(10).text('(HR Signature)', 50, doc.y + 20);
          }
          doc.moveDown(4); 
          continue;
      }

      if (line.includes('{{employeeSignature}}')) {
          if (signatures.employeeSignature) {
            const empSigBuffer = dataUrlToBuffer(signatures.employeeSignature);
            if (empSigBuffer) {
                doc.image(empSigBuffer, doc.page.width - 200, doc.y, { width: 100 });
                doc.fontSize(8).text(`Digitally Signed by ${employee.fullName}`, doc.page.width - 200, doc.y + 60, { align: 'left' });
            }
          } else {
            doc.fontSize(10).text('(Employee Signature)', doc.page.width - 200, doc.y + 20);
          }
          doc.moveDown(4); 
          continue;
      }

      // Check for headers (simple heuristic: starts with number or ALL CAPS)
      const isHeader = /^\d+\.\s[A-Z]/.test(line.trim()) || /^[A-Z\s&]+$/.test(line.trim());
      
      if (isHeader) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text(line.trim());
      } else {
        doc.font('Helvetica').text(line.trim(), { align: 'justify' });
      }
      doc.moveDown(0.5);
    }
  }

  // Only render default signature block if placeholders were NOT found
  if (!hasHrSigPlaceholder && !hasEmpSigPlaceholder) {
      doc.moveDown(2);
      checkPageBreak();

      doc.text('IN WITNESS whereof the parties hereto have hereunto set their hands the day and year first herein before written.');
      doc.moveDown(2);
      
      // Signatures Section
      const sigY = doc.y;
      
      // Left side (Company)
      doc.font('Helvetica-Bold').text('SIGNED', 50, sigY);
      doc.font('Helvetica').text('for and on behalf of');
      doc.font('Helvetica-Bold').text('PropNinja Consulting Pvt. Ltd.');
      doc.font('Helvetica').text('Authorized Signatory');
      
      if (signatures.hrSignature) {
         const hrSigBuffer = dataUrlToBuffer(signatures.hrSignature);
         if (hrSigBuffer) {
            doc.image(hrSigBuffer, 50, doc.y + 10, { width: 100 });
            doc.fontSize(8).text('Digitally Signed by HR', 50, doc.y + 70);
         }
      } else {
         // Placeholder
         doc.text('(HR Signature)', 50, doc.y + 10);
      }

      // Right side (Employee)
      doc.fontSize(10).font('Helvetica-Bold').text('Accepted:', 350, sigY);
      doc.font('Helvetica').text(`Date: ${signingDate}`, 350, sigY + 20);
      
      if (signatures.employeeSignature) {
         const empSigBuffer = dataUrlToBuffer(signatures.employeeSignature);
         if (empSigBuffer) {
            doc.image(empSigBuffer, 350, sigY + 40, { width: 100 });
            doc.fontSize(8).text(`Digitally Signed by ${employee.fullName}`, 350, sigY + 100);
         }
      } else {
         // Placeholder
         doc.fontSize(10).text('(Employee Signature)', 350, sigY + 40);
      }
      
      doc.fontSize(10).font('Helvetica-Bold').text(`${salutationText} ${employee.fullName}`, 350, sigY + 110);
  }
  
  addFooter(doc, pageNo);
  
  // --- ANNEXURE A ---
  doc.addPage();
  pageNo += 1;
  addHeader(doc, logoBuffer);
  addWatermark(doc, logoBuffer);
  
  doc.moveDown();
  doc.fontSize(12).font('Helvetica-Bold').text('ANNEXURE A', { align: 'center', underline: true });
  doc.moveDown();
  doc.text('PARTICULARS OF EMPLOYMENT', { align: 'center' });
  doc.moveDown(2);

  // Particulars Table
  const pTableTop = doc.y;
  let py = pTableTop;
  
  const drawPRow = (label, value) => {
    doc.font('Helvetica').text(label, 50, py);
    doc.font('Helvetica-Bold').text(`:  ${value}`, 200, py);
    py += 20;
  };

  drawPRow('Name', `${salutationText} ${employee.fullName}`);
  drawPRow('Father Name', `Mr. ${fatherName}`);
  drawPRow('Designation', designation);
  drawPRow('Department', employee.departmentId?.name || 'Primary Sales India');
  drawPRow('Job Location', 'Bangalore');
  drawPRow('Probation Period', '6 Months');
  drawPRow('Notice Period', '30 days');
  drawPRow('Date of Joining', joinDt);
  drawPRow('Employee ID', employee.employeeId || 'N/A');
  drawPRow('Aadhar Number', employee.personalDetails?.aadharNumber || 'N/A');
  drawPRow('Pan Number', employee.personalDetails?.panNumber || 'N/A');
  drawPRow('Annual Gross CTC', `${ctc} INR`);

  doc.moveDown(2);
  doc.y = py + 20;
  
  drawSalaryTable(doc, employee);
  
  doc.moveDown(4);
  doc.font('Helvetica-Bold').text(`(${salutationText} ${employee.fullName})`);
  doc.text(`Date: ${joinDt}`);
  
  addFooter(doc, pageNo);

  // --- CONFIDENTIALITY AGREEMENT ---
  doc.addPage();
  pageNo += 1;
  addHeader(doc, logoBuffer);
  addWatermark(doc, logoBuffer);

  doc.moveDown();
  doc.fontSize(14).font('Helvetica-Bold').text('CONFIDENTIALITY AGREEMENT', { align: 'center', underline: true });
  doc.moveDown();

  const confidentialityContent = `
In consideration of an Employee's employment with The Company, employees will be exposed to information and materials relating to the affairs, transactions, operations, methods of doing business, research and development, know-how, customers trade secrets, financial methods, computer programs, and other confidential or proprietary information or trade secrets of the Company, its Associated Companies, Business Partners, Distributors, Resellers, Customers and End-Users.
An Employee agrees to take all appropriate action, whether by instruction, agreement or otherwise, to ensure the protection, confidentiality and security of the Confidential Information of the Company.

1. Under CONFIDENTIALITY, Employee agrees:
a. Electronic information exchange or office emails are to be used in furtherance of Company's business only. No employee should use the electronic information systems to espouse personal, political or religious views or solicit support for any cause or event. Such act by employee is subjected to immediate internal inquiry by the management.
b. Not to use, acquire or copy any Confidential Information in whole or part without prior authorization in writing from a designated official of the Company.
c. To retain the Confidential Information as strictly confidential and as a trade secret of the Company; and
d. Not to use or cause to be used, nor to disclose or otherwise make available directly or indirectly the Confidential Information except for and on behalf of the Company when authorized to make such disclosure on a confidential basis or to recipient authorized by the Company and having a valid contract with terms satisfactory to PropNinja Consulting Pvt. Ltd. under which its nature as confidential information and as a trade secret is respected and the recipient promises to retain it in confidence.

Upon termination of employment, Employee agrees to surrender to the Company all tangible & non-tangible forms of the Confidential Information that he may then possess or have under his/her control.

2. INTELLECTUAL PROPERTY shall include:
a. If during the course of his/her work for the Company (whether in the course of normal duties or not and whether or not during normal working hours), the Employee makes, or participates in the making of any design (whether registered or not) or any work in which copyright and/or database rights subsist, the Employee hereby assigns to the Company with full title guarantee and, where appropriate, by way of future assignment, all such rights for the full term thereof throughout the world, provided that the assignment shall not extend to those designs or works which are created by the Employee wholly outside his/her normal working hours and wholly unconcerned with his/her service under this Agreement.
b. All technology infrastructure of the Company and its employees, whether specifically licensed or furnished as part of The Company equipment rented, purchased or loaned and Software Service for them. Technology infrastructure shall mean machine instructions whether denominated software wherever resident and on whatever media and all related documentation and software.
c. All other information and material of The Company and its Employees, relating to design, method of construction, manufacture, operations, specifications, use and service of the Company and its Employees equipment and components, including notebooks, reports, process data, test data, performance data, inventions and all documentation therefore and all copies.
d. Corporate strategies and other confidential and proprietary material and information, which could cause competitive harm to The Company and its Employees if disclosed.
e. The Company's staff list, Customer and prospective customer list.

Employee agrees to retain Intellectual Property as strictly confidential and a trade secret of The Company Employee agrees not to use or cause to be used The Company and its Employees' Intellectual Property except for or on behalf of The Company. Upon termination of employment, employee agrees to surrender to The Company all tangible & non-tangible forms of Company's Intellectual Property, which he/she may then possess or have under his/her control.

3. EXCLUSIVITY OF SERVICE shall include:
The Employee shall not during the continuance of this contract, except with the knowledge and consent of the Company embark, engage or interest himself/herself whether for reward or gratuitously in any activity which would interfere with the performance of the Employee's duties with the Company or which to his/her knowledge would constitute a conflict of interest with the business of the Company.

4. AGREEMENT NOT TO COMPETE OR SOLICIT shall include:
a. Throughout this Agreement with the Company, and for a period of 12 months following the termination of this Agreement, the Employee will not directly or in association with others, compete with any of the business activities in which the Company or any of its associated companies become involved, anywhere in the world, during the period of this Agreement.
b. The foregoing restriction on competition and solicitation will preclude without limitation:
I. Selling or soliciting sales of products and services which compete with the Company or any of its subsidiaries, and
II. Accepting employment in a related business area with or acting as a representative or agent of a current customer of the Company or any other person or entity which competes with the current business of the Company during the period of this Agreement.
III. In order to protect its business interest, the Company, reserves the right of not providing full-fledged work during the Employee's required contractual probation period and may require Employee not to attend the place of work whilst remaining employed for the contractual probation period. During this probation period, the employee will not be permitted to work for anyone else.
IV. Either alone or in association with others (i) solicit, or encourage any organization directly or indirectly controlled by the Employee to solicit, any employee of the Company or any of its subsidiaries to leave the employ of the Company or any of its subsidiaries, (ii) solicit for employment, hire or engage as an independent contractor, or permit any organization directly or indirectly controlled by the Employee to solicit for employment, hire or engage as an independent contractor, any person who was employed by the Company or any of its subsidiaries at any time during the term of the Employee's employment with the Company or any of its subsidiaries.

While the restrictions aforesaid are considered by the Company and the Employee to be reasonable in all the circumstances, it is agreed that if any one or more of such restrictions shall either taken by itself or themselves together be adjudged to go beyond what is reasonable in all the circumstances for the protection of the Company's legitimate interest but would be adjudged reasonable if any particular restriction or restrictions were deleted or if any part or parts of the wording thereof were deleted, restricted or limited in any particular manner, then the said restrictions shall apply with such deletions, restrictions or limitations, as the case may be.

IN WITNESS whereof the parties hereto have hereunto set their hands the day and year first herein before written.
SIGNED
for and on behalf of
PropNinja Consulting Pvt. Ltd.

All Terms and Conditions
Accepted:
Authorized Signatory

Date: ${joinDt}
(${salutationText} ${employee.fullName})
`;

  // Render Confidentiality Content
  const cLines = confidentialityContent.split('\n');
  doc.fontSize(10);
  for (const line of cLines) {
    if (line.trim()) {
      checkPageBreak();
      const isHeader = /^\d+\.\s[A-Z]/.test(line.trim());
      if (isHeader) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').text(line.trim());
      } else {
        doc.font('Helvetica').text(line.trim(), { align: 'justify' });
      }
      doc.moveDown(0.5);
    }
  }

  addFooter(doc, pageNo);
  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

exports.generateDocumentHtml = async (type, employee) => {
  let content = await getTemplateContent(type);
  if (!content) return '';

  const joinDt = employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : '________________';
  const ctc = employee.salary?.ctc || 0;
  const fatherName = employee.personalDetails?.fatherName || '________________';
  const address = employee.address || '________________';
  const designation = employee.designation || '________________';
  const salutationText = employee.salutation || 'Ms./Mr.';

  // Replace placeholders
  content = content.replace(/{{fullName}}/g, employee.fullName);
  content = content.replace(/{{designation}}/g, employee.designation);
  content = content.replace(/{{joiningDate}}/g, joinDt);
  content = content.replace(/{{signingDate}}/g, '________________'); // Placeholder for preview
  content = content.replace(/{{ctc}}/g, ctc);
  content = content.replace(/{{address}}/g, address);
  content = content.replace(/{{email}}/g, employee.email);
  content = content.replace(/{{fatherName}}/g, fatherName);
  content = content.replace(/{{today}}/g, new Date().toLocaleDateString('en-GB'));
  content = content.replace(/{{salutation}}/g, salutationText);
  {
    const { decryptField } = require('../utils/fieldCrypto');
    const aad = employee.personalDetails?.aadharNumber;
    const pan = employee.personalDetails?.panNumber;
    content = content.replace(/{{aadharNumber}}/g, aad ? decryptField(aad) : '________________');
    content = content.replace(/{{panNumber}}/g, pan ? decryptField(pan) : '________________');
  }
  content = content.replace(/{{employeeId}}/g, employee.employeeId || '________________');
  
  // Replace Signature Placeholders for HTML Preview
  content = content.replace(/{{hrSignature}}/g, '<br/><strong>[HR Signature Placeholder]</strong><br/>Digitally Signed by HR<br/>');
  content = content.replace(/{{employeeSignature}}/g, `<br/><strong>[Employee Signature Placeholder]</strong><br/>Digitally Signed by ${employee.fullName}<br/>`);

  // Simple HTML formatting
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      ${content.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br/>').join('')}
    </div>
  `;
};
