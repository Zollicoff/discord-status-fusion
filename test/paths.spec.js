const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { PROJECT_ROOT, resolvePaths } = require('../src/paths');

describe('resolvePaths', () => {
  it('uses Application Support and Library/Logs on macOS', () => {
    const paths = resolvePaths({ platform: 'darwin', env: {}, homedir: '/Users/me' });
    assert.strictEqual(paths.pidFile, '/Users/me/Library/Application Support/discord-status-fusion/dsf.pid');
    assert.strictEqual(paths.logFile, '/Users/me/Library/Logs/discord-status-fusion.log');
  });

  it('follows XDG_STATE_HOME on Linux', () => {
    assert.strictEqual(
      resolvePaths({ platform: 'linux', env: {}, homedir: '/home/me' }).pidFile,
      '/home/me/.local/state/discord-status-fusion/dsf.pid'
    );
    assert.strictEqual(
      resolvePaths({ platform: 'linux', env: { XDG_STATE_HOME: '/xdg' }, homedir: '/home/me' }).logFile,
      '/xdg/discord-status-fusion/discord-status-fusion.log'
    );
  });

  it('uses LOCALAPPDATA on Windows', () => {
    const paths = resolvePaths({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, homedir: 'C:\\Users\\me' });
    assert.strictEqual(paths.pidFile, 'C:\\Users\\me\\AppData\\Local\\discord-status-fusion\\dsf.pid');
  });

  it('honours overrides and locates project files', () => {
    const paths = resolvePaths({ platform: 'darwin', env: { DSF_STATE_DIR: '/state', DSF_ENV_FILE: '/cfg/.env' }, homedir: '/Users/me' });
    assert.strictEqual(paths.pidFile, '/state/dsf.pid');
    assert.strictEqual(paths.logFile, '/state/discord-status-fusion.log');
    assert.strictEqual(paths.envFile, '/cfg/.env');
    assert.strictEqual(paths.mainFile, path.join(PROJECT_ROOT, 'main.js'));
    assert.strictEqual(paths.legacyPidFile, path.join(PROJECT_ROOT, 'dsf.pid'));
  });
});
