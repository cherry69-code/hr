const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getCompanyLogoBuffer } = require('../utils/branding');

const stripHtml = (html) => {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const dataUrlToBuffer = (dataUrl) => {
  if (!dataUrl) return null;
  const parts = String(dataUrl).split(',');
  if (parts.length < 2) return null;
  return Buffer.from(parts[1], 'base64');
};

exports.generateFinalPdf = async ({
  outputPath,
  title,
  htmlContent,
  employeeName,
  employeeSignatureDataUrl,
  hrSignatureDataUrl
}) => {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const logoBuffer = getCompanyLogoBuffer();
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
    doc.fillColor('black');
    doc.moveDown(2);
  };

  const addFooter = () => {
    const y = doc.page.height - 40;
    doc.fontSize(8).fillColor('#64748B').text('PropNinja HR • Confidential', 50, y, { align: 'left' });
    doc.fontSize(8).fillColor('#64748B').text(`Page ${pageNo}`, 50, y, { align: 'right' });
    doc.fillColor('black');
  };

  const decoratePage = () => {
    addHeader();
    addWatermark();
  };

  doc.on('pageAdded', () => {
    pageNo += 1;
    decoratePage();
  });

  decoratePage();

  doc.fontSize(16).text(title || 'Document', { align: 'center' });
  doc.moveDown();

  const text = stripHtml(htmlContent);
  doc.fontSize(10).text(text, { align: 'left' });

  doc.moveDown(2);
  doc.fontSize(10).text('Employee Signature:', { underline: true });
  doc.moveDown(0.5);
  const employeeSig = dataUrlToBuffer(employeeSignatureDataUrl);
  if (employeeSig) {
    doc.image(employeeSig, { width: 180 });
  }
  doc.moveDown();
  doc.text(employeeName || '');

  doc.moveDown(2);
  doc.fontSize(10).text('HR Signature:', { underline: true });
  doc.moveDown(0.5);
  const hrSig = dataUrlToBuffer(hrSignatureDataUrl);
  if (hrSig) {
    doc.image(hrSig, { width: 180 });
  }
  doc.moveDown();
  doc.text('PropNinja HR');

  addFooter();
  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return outputPath;
};
