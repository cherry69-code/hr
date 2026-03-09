const dotenv = require('../backend/node_modules/dotenv');
const mongoose = require('../backend/node_modules/mongoose');
const connectDB = require('../backend/config/db');
const Document = require('../backend/models/Document');

dotenv.config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
dotenv.config();

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/inspect-document-url.js <token>');
  process.exit(1);
}

(async () => {
  try {
    await connectDB();
    const doc = await Document.findOne({ token }).lean();
    if (!doc) {
      console.log('not found');
      process.exit(0);
    }
    console.log('type', doc.type);
    console.log('status', doc.status);
    console.log('url', doc.url);
  } catch (e) {
    console.error('error', e && e.message ? e.message : String(e));
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
  }
})();
