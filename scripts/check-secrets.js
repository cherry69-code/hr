const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getStagedFiles() {
  const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

function shouldSkip(file) {
  const skipDirs = ['node_modules', 'dist', '.angular', '.husky', 'coverage', 'tmp', 'temp'];
  if (skipDirs.some((d) => file.startsWith(`${d}/`) || file.includes(`/${d}/`))) return true;
  const skipFiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
  if (skipFiles.some((f) => file.endsWith(f))) return true;
  return false;
}

const PATTERNS = [
  { name: 'MongoDB URI', regex: /mongodb\+srv:\/\//i },
  { name: 'Private Key', regex: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/ },
  { name: 'JWT Secret', regex: /JWT[_-]?SECRET\s*[:=]\s*.+/i },
  { name: 'Cloudinary API Secret', regex: /CLOUDINARY_.*(API|SECRET)\s*[:=]\s*.+/i },
  { name: 'SMTP Password', regex: /SMTP_.*(PASS|PASSWORD)\s*[:=]\s*.+/i },
  { name: 'Generic API Key', regex: /API[_-]?KEY\s*[:=]\s*.+/i },
];

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const hits = [];
  for (const p of PATTERNS) {
    if (p.regex.test(content)) {
      hits.push(p.name);
    }
  }
  return hits;
}

function main() {
  try {
    const files = getStagedFiles().filter((f) => !shouldSkip(f));
    const findings = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.ico', '.svg', '.woff', '.woff2'].includes(ext)) continue;
      const hits = scanFile(file);
      if (hits.length) {
        findings.push({ file, hits });
      }
    }
    if (findings.length) {
      console.error('Secret scan failed. Potential secrets detected in staged files:');
      for (const f of findings) {
        console.error(`- ${f.file}: ${f.hits.join(', ')}`);
      }
      console.error('If these are false positives, commit with --no-verify, but review carefully.');
      process.exit(1);
    }
  } catch (e) {
    console.error('Secret scan error:', e.message);
    // Fail closed
    process.exit(1);
  }
}

main();

