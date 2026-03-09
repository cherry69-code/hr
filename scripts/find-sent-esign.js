const dotenv = require('../backend/node_modules/dotenv');
const mongoose = require('../backend/node_modules/mongoose');
const connectDB = require('../backend/config/db');
const Document = require('../backend/models/Document');

dotenv.config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
dotenv.config();

(async () => {
  try {
    await connectDB();
    const docs = await Document.find({ token: { $exists: true, $ne: '' }, status: 'Sent' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    for (const d of docs) {
      console.log(d.type, d.status, d.token, d.url || '');
    }
  } catch (e) {
    console.error(e && e.message ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
  }
})();
