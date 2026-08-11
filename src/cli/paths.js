const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

module.exports = Object.freeze({
  logFile: path.join(PROJECT_ROOT, 'discord-status-fusion.log'),
  mainFile: path.join(PROJECT_ROOT, 'main.js'),
  pidFile: path.join(PROJECT_ROOT, 'dsf.pid'),
  projectRoot: PROJECT_ROOT
});
