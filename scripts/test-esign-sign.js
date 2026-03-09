const http = require('http');

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/test-esign-sign.js <token>');
  process.exit(1);
}

const url = `http://localhost:5000/api/esign/sign/${token}`;

http
  .get(url, (res) => {
    let body = '';
    res.on('data', (c) => (body += c.toString('utf8')));
    res.on('end', () => {
      console.log('status', res.statusCode);
      console.log(body.slice(0, 500));
      process.exit(0);
    });
  })
  .on('error', (e) => {
    console.error('error', e.message);
    process.exit(1);
  });

