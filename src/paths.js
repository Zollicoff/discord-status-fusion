const os = require('os');
const path = require('path');

const APP_NAME = 'discord-status-fusion';
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Resolve runtime file locations. State lives in the platform's per-user
 * directory so the daemon works from a read-only or global install.
 */
function resolvePaths(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();
  const join = platform === 'win32' ? path.win32.join : path.posix.join;

  let stateDir;
  let logFile;
  if (env.DSF_STATE_DIR) {
    stateDir = env.DSF_STATE_DIR;
  } else if (platform === 'darwin') {
    stateDir = join(home, 'Library', 'Application Support', APP_NAME);
    logFile = join(home, 'Library', 'Logs', `${APP_NAME}.log`);
  } else if (platform === 'win32') {
    stateDir = join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), APP_NAME);
  } else {
    stateDir = join(env.XDG_STATE_HOME || join(home, '.local', 'state'), APP_NAME);
  }

  return Object.freeze({
    projectRoot: PROJECT_ROOT,
    mainFile: path.join(PROJECT_ROOT, 'main.js'),
    envFile: env.DSF_ENV_FILE || path.join(PROJECT_ROOT, '.env'),
    stateDir,
    pidFile: join(stateDir, 'dsf.pid'),
    logFile: logFile || join(stateDir, `${APP_NAME}.log`),
    legacyPidFile: path.join(PROJECT_ROOT, 'dsf.pid'),
    home
  });
}

module.exports = {
  APP_NAME,
  PROJECT_ROOT,
  resolvePaths
};
