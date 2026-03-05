const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('--- Cloudinary Config Check ---');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key:', process.env.CLOUDINARY_API_KEY);
// Mask Secret
const secret = process.env.CLOUDINARY_API_SECRET || '';
console.log('API Secret:', secret ? `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}` : 'MISSING');

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Missing Cloudinary Environment Variables!');
  process.exit(1);
}

// Configure
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Upload
const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

console.log('Attempting upload...');
cloudinary.uploader.upload(testImage, { folder: 'test_upload' })
  .then(result => {
    console.log('✅ Upload Successful!');
    console.log('URL:', result.secure_url);
  })
  .catch(err => {
    console.error('❌ Upload Failed:', err);
  });
