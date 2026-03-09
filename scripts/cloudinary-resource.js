const dotenv = require('../backend/node_modules/dotenv');
const cloudinary = require('../backend/node_modules/cloudinary').v2;

dotenv.config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const publicId = process.argv[2];
if (!publicId) {
  console.error('Usage: node scripts/cloudinary-resource.js <publicId>');
  process.exit(1);
}

(async () => {
  try {
    const r = await cloudinary.api.resource(publicId, { resource_type: 'raw', type: 'upload' });
    console.log(JSON.stringify({ public_id: r.public_id, format: r.format, resource_type: r.resource_type, type: r.type, secure_url: r.secure_url }, null, 2));
  } catch (e) {
    const msg = e && e.message ? e.message : '';
    const details = e && typeof e === 'object' ? JSON.stringify(e, null, 2) : String(e);
    console.error('error', msg || details);
    process.exit(1);
  }
})();
