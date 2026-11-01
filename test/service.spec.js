const { describe, it } = require('node:test');
const assert = require('node:assert');

const { SERVICE_LABEL, ServiceManager, escapeXml, quoteSystemd, quoteVbs } = require('../src/cli/service');

function memoryFs() {
  const files = new Map();
  return {
    files,
    existsSync: file => files.has(file),
    mkdirSync() {},
    unlinkSync: file => files.delete(file),
    writeFileSync: (file, content) => files.set(file, content)
  };
}

function createManager(platform, overrides = {}) {
  const commands = [];
  const fs = memoryFs();
  const paths = platform === 'win32' ?
    { home: 'C:\\Users\\me', logFile: 'C:\\Users\\me\\AppData\\Local\\dsf\\dsf.log', mainFile: 'C:\\dsf\\main.js', projectRoot: 'C:\\dsf' } :
    { home: '/home/me', logFile: '/home/me/.local/state/discord-status-fusion/dsf.log', mainFile: '/opt/dsf & co/main.js', projectRoot: '/opt/dsf & co' };
  const manager = new ServiceManager({
    env: {},
    execFileSync: (command, args) => {
      commands.push([command, ...args].join(' '));
      if (overrides.failOn && command === overrides.failOn) {
        throw new Error(`${command} failed`);
      }
      return '';
    },
    fs,
    nodePath: platform === 'win32' ? 'C:\\node\\node.exe' : '/usr/bin/node',
    paths,
    platform,
    uid: 501
  });
  return { commands, fs, manager };
}

describe('ServiceManager', () => {
  it('installs a launchd agent on macOS', () => {
    const { commands, fs, manager } = createManager('darwin');

    const file = manager.install();

    assert.strictEqual(file, `/home/me/Library/LaunchAgents/${SERVICE_LABEL}.plist`);
    const plist = fs.files.get(file);
    assert.match(plist, /<string>\/usr\/bin\/node<\/string>/);
    assert.match(plist, /<string>\/opt\/dsf &amp; co\/main.js<\/string>/);
    assert.match(plist, /<key>SuccessfulExit<\/key>\s*<false\/>/);
    assert.deepStrictEqual(commands, [
      `launchctl bootout gui/501/${SERVICE_LABEL}`,
      `launchctl bootstrap gui/501 ${file}`
    ]);
    assert.strictEqual(manager.isInstalled(), true);

    commands.length = 0;
    assert.strictEqual(manager.uninstall(), true);
    assert.deepStrictEqual(commands, [`launchctl bootout gui/501/${SERVICE_LABEL}`]);
    assert.strictEqual(manager.isInstalled(), false);
    assert.strictEqual(manager.uninstall(), false);
  });

  it('installs a systemd user unit on Linux', () => {
    const { commands, fs, manager } = createManager('linux');

    const file = manager.install();

    assert.strictEqual(file, '/home/me/.config/systemd/user/discord-status-fusion.service');
    const unit = fs.files.get(file);
    assert.match(unit, /^ExecStart="\/usr\/bin\/node" "\/opt\/dsf & co\/main.js"$/m);
    assert.match(unit, /^Restart=on-failure$/m);
    assert.match(unit, /^StandardOutput=append:\/home\/me\/.local\/state\/discord-status-fusion\/dsf.log$/m);
    assert.deepStrictEqual(commands, [
      'systemctl --user daemon-reload',
      'systemctl --user enable --now discord-status-fusion.service'
    ]);

    commands.length = 0;
    manager.uninstall();
    assert.deepStrictEqual(commands, [
      'systemctl --user disable --now discord-status-fusion.service',
      'systemctl --user daemon-reload'
    ]);
  });

  it('installs a hidden Startup script on Windows', () => {
    const { commands, fs, manager } = createManager('win32');

    const file = manager.install();

    assert.strictEqual(
      file,
      'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\discord-status-fusion.vbs'
    );
    assert.match(
      fs.files.get(file),
      /\.Run """C:\\node\\node\.exe"" ""C:\\dsf\\main\.js"" ""--log-file=C:\\Users\\me\\AppData\\Local\\dsf\\dsf\.log""", 0, False/
    );
    assert.deepStrictEqual(commands, [`wscript.exe ${file}`]);
  });

  it('propagates activation failures', () => {
    const { manager } = createManager('linux', { failOn: 'systemctl' });
    assert.throws(() => manager.install(), /systemctl failed/);
  });

  it('refuses unsupported platforms', () => {
    const { manager } = createManager('aix');
    assert.strictEqual(manager.isInstalled(), false);
    assert.throws(() => manager.install(), /not supported on aix/);
  });

  it('escapes values for each service format', () => {
    assert.strictEqual(escapeXml('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;');
    assert.strictEqual(quoteSystemd('C:\\x "y" 100%'), '"C:\\\\x \\"y\\" 100%%"');
    assert.strictEqual(quoteVbs('say "hi"'), '""say ""hi""""');
  });
});
