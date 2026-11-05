'use strict';
// Electron's npm package does not download its binary during install any more; fetch it here.
// No-op when it is already present, or when electron is not installed (production installs).
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const installer = path.join(__dirname, '..', 'node_modules', 'electron', 'install.js');
if (!fs.existsSync(installer)) process.exit(0);
execFileSync(process.execPath, [installer], { stdio: 'inherit' });
