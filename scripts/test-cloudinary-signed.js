const dotenv = require('../backend/node_modules/dotenv');
const cloudinary = require('../backend/node_modules/cloudinary').v2;
const https = require('https');
const { URL } = require('url');

dotenv.config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const original = process.argv[2];
if (!original) {
  console.error('Usage: node scripts/test-cloudinary-signed.js <cloudinary_raw_url>');
  process.exit(1);
}

const match = String(original).match(/\/raw\/upload\/(?:v\d+\/)?(.+)\.pdf$/);
if (!match || !match[1]) {
  console.error('Could not parse publicId');
  process.exit(2);
}

const publicId = match[1];
const signed = cloudinary.url(publicId, {
  resource_type: 'raw',
  type: 'upload',
  format: 'pdf',
  secure: true,
  sign_url: true
});

console.log('signedUrl', signed);

const u = new URL(signed);
https
  .get({ hostname: u.hostname, path: `${u.pathname}${u.search}` }, (res) => {
    let bytes = 0;
    res.on('data', (c) => (bytes += c.length));
    res.on('end', () => {
      console.log('status', res.statusCode);
      console.log('content-type', res.headers['content-type'] || '');
      console.log('bytes', bytes);
      process.exit(0);
    });
  })
  .on('error', (e) => {
    console.error('error', e.message);
    process.exit(1);
  });

