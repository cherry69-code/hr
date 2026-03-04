const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Document = require('../models/Document');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const doc = await Document.findOne({
    status: 'Completed',
    type: { $in: ['offer_letter', 'joining_agreement'] }
  }).sort({ updatedAt: -1 }).lean();

  if (!doc) {
    process.stdout.write('No Completed offer_letter/joining_agreement documents found.\n');
    process.exit(0);
  }

  const report = {
    id: String(doc._id),
    type: doc.type,
    status: doc.status,
    hasEmployeeSignature: Boolean(doc.employeeSignature),
    hasEmployeeSignedAt: Boolean(doc.employeeSignedAt),
    hasEmployeeIP: Boolean(doc.employeeIP),
    hasHrSignature: Boolean(doc.hrSignature),
    hasDocumentHash: Boolean(doc.documentHash),
    hasUrl: Boolean(doc.url)
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
};

run().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});

