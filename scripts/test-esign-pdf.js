const http = require('http');

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/test-esign-pdf.js <token>');
  process.exit(1);
}

const url = `http://localhost:5000/api/esign/pdf/${token}`;

http
  .get(url, (res) => {
    const ct = res.headers['content-type'] || '';
    let bytes = 0;
    res.on('data', (chunk) => {
      bytes += chunk.length;
    });
    res.on('end', () => {
      console.log('status', res.statusCode);
      console.log('content-type', ct);
      console.log('bytes', bytes);
      process.exit(res.statusCode === 200 && ct.includes('pdf') && bytes > 0 ? 0 : 2);
    });
  })
  .on('error', (e) => {
    console.error('error', e.message);
    process.exit(1);
  });

