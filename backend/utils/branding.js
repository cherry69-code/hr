const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

let cachedLogoBuffer = null;

const fetchBuffer = (urlStr, redirectCount = 0) => new Promise((resolve, reject) => {
  try {
    const url = new URL(urlStr);
    const lib = url.protocol === 'http:' ? http : https;

    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'prophr/1.0',
          Accept: '*/*'
        }
      },
      (res) => {
        const status = Number(res.statusCode || 0);

        if ([301, 302, 303, 307, 308].includes(status)) {
          const next = res.headers.location;
          if (next && redirectCount < 3) {
            res.resume();
            resolve(fetchBuffer(new URL(next, url).toString(), redirectCount + 1));
            return;
          }
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Failed to fetch asset. HTTP ${status}`));
          return;
        }

        const chunks = [];
        let total = 0;
        const maxBytes = 5 * 1024 * 1024;

        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy(new Error('Asset too large'));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );

    req.on('error', reject);
    req.end();
  } catch (e) {
    reject(e);
  }
});

const getCompanyLogoBuffer = async () => {
  if (cachedLogoBuffer) return cachedLogoBuffer;

  const base64 = process.env.COMPANY_LOGO_BASE64;
  if (base64) {
    try {
      cachedLogoBuffer = Buffer.from(base64, 'base64');
      return cachedLogoBuffer;
    } catch {
      return null;
    }
  }

  const url = process.env.COMPANY_LOGO_URL;
  if (url) {
    try {
      cachedLogoBuffer = await fetchBuffer(url);
      return cachedLogoBuffer;
    } catch {}
  }

  const candidatePaths = [];
  if (process.env.COMPANY_LOGO_PATH) {
    candidatePaths.push(process.env.COMPANY_LOGO_PATH);
  }

  // Priority: Prop Ninja_Logo.jpg in frontend assets
  candidatePaths.push(path.join(__dirname, '../../frontend/src/assets/Prop Ninja_Logo.jpg'));
  
  // Fallbacks
  candidatePaths.push(path.join(__dirname, '..', 'assets', 'propninja-logo.png'));
  candidatePaths.push(path.join(__dirname, '..', 'assets', 'propninja-logo.jpg'));
  candidatePaths.push(path.join(__dirname, '..', 'assets', 'logo.png'));
  candidatePaths.push(path.join(__dirname, '..', 'assets', 'logo.jpg'));

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        cachedLogoBuffer = fs.readFileSync(p);
        return cachedLogoBuffer;
      }
    } catch {}
  }

  return null;
};

module.exports = { getCompanyLogoBuffer };
