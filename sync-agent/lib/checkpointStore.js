const fs = require('fs');
const path = require('path');

const ensureDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

exports.loadState = (filePath) => {
  ensureDir(filePath);
  if (!fs.existsSync(filePath)) {
    return {
      lastSyncedTime: null,
      lastRunAt: null,
      lastRunStatus: 'never',
      lastError: ''
    };
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      lastSyncedTime: null,
      lastRunAt: null,
      lastRunStatus: 'corrupt',
      lastError: 'State file could not be parsed'
    };
  }
};

exports.saveState = (filePath, state) => {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
};
