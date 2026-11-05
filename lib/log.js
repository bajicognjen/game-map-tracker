'use strict';
/** A small diagnostics log in <userData>/logs/app.log (rotated at 1 MB) for things users report. */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const logDir = () => path.join(app.getPath('userData'), 'logs');
const logFile = () => path.join(logDir(), 'app.log');

function write(level, message, extra) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const f = logFile();
    try { if (fs.statSync(f).size > 1048576) fs.renameSync(f, `${f}.1`); } catch { /* no file yet */ }
    const detail = extra instanceof Error ? { message: extra.message, stack: extra.stack } : extra;
    fs.appendFileSync(f, `${new Date().toISOString()} ${level.padEnd(5)} ${message}${detail ? ` ${JSON.stringify(detail)}` : ''}\n`);
  } catch { /* logging must never break the app */ }
}

module.exports = {
  info: (m, e) => write('INFO', m, e),
  warn: (m, e) => write('WARN', m, e),
  error: (m, e) => write('ERROR', m, e),
  logDir,
  logFile,
};
