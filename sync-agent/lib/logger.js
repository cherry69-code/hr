const fs = require('fs');
const path = require('path');

const timestamp = () => new Date().toISOString();

exports.createLogger = (logDir) => {
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'agent.log');

  const write = (level, message, meta) => {
    const line = JSON.stringify({
      ts: timestamp(),
      level,
      message,
      ...(meta ? { meta } : {})
    });
    fs.appendFileSync(logFile, `${line}\n`);
    if (level === 'error') {
      console.error(`[${level}] ${message}`, meta || '');
    } else {
      console.log(`[${level}] ${message}`, meta || '');
    }
  };

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
  };
};
