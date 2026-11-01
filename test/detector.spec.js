const { describe, it } = require('node:test');
const assert = require('node:assert');

const { APP_CATALOG, getApp, matchApp, resolveApp } = require('../src/core/app-catalog');
const { CATEGORY_PHRASES } = require('../src/core/activity');
const { AppDetector, encodePowerShell, WINDOWS_SCRIPT } = require('../src/core/detector');

function nameOf(detector, processName) {
  return detector.identify(processName)?.name || null;
}

/**
 * Fake execFile that answers by command name.
 */
function fakeExec(responses, calls = []) {
  return (command, args, _options, callback) => {
    calls.push({ command, args });
    const response = responses[command];
    const value = typeof response === 'function' ? response(args) : response;
    if (value instanceof Error) {
      callback(value);
    } else if (value === undefined) {
      callback(Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' }));
    } else {
      callback(null, value);
    }
  };
}

describe('app catalog', () => {
  it('has unique ids and a phrase set for every category', () => {
    assert.strictEqual(new Set(APP_CATALOG.map(entry => entry.id)).size, APP_CATALOG.length);
    for (const entry of APP_CATALOG) {
      assert.ok(CATEGORY_PHRASES[entry.category], `${entry.id} has unknown category ${entry.category}`);
      assert.ok(entry.patterns.length > 0);
    }
  });

  it('resolves user references by id, display name, or alias', () => {
    assert.strictEqual(resolveApp('vscode').id, 'vscode');
    assert.strictEqual(resolveApp('VS Code').id, 'vscode');
    assert.strictEqual(resolveApp('Visual Studio Code').id, 'vscode');
    assert.strictEqual(resolveApp('  safari ').id, 'safari');
    assert.strictEqual(resolveApp('not an app'), null);
    assert.strictEqual(getApp('chrome').name, 'Google Chrome');
    assert.strictEqual(matchApp('chrome').id, matchApp('Google Chrome').id);
  });
});

describe('AppDetector.identify', () => {
  const detector = new AppDetector();

  it('maps aliases to one canonical app', () => {
    assert.strictEqual(nameOf(detector, 'code'), 'VS Code');
    assert.strictEqual(nameOf(detector, 'Visual Studio Code'), 'VS Code');
    assert.strictEqual(nameOf(detector, 'code --unity-launch'), 'VS Code');
    assert.strictEqual(nameOf(detector, 'T3 Code (Nightly)'), 'T3 Code');
    assert.strictEqual(nameOf(detector, 'WINWORD'), 'Microsoft Word');
    assert.strictEqual(nameOf(detector, 'WindowsTerminal'), 'Windows Terminal');
    assert.strictEqual(nameOf(detector, 'Affinity Designer 2'), 'Affinity Designer');
    assert.strictEqual(nameOf(detector, 'google-chrome-stable'), 'Google Chrome');
    assert.strictEqual(nameOf(detector, '/opt/google/chrome/chrome --type=renderer'), 'Google Chrome');
  });

  it('resolves bundle paths to the outer app', () => {
    assert.strictEqual(nameOf(detector, '/Applications/Warp.app/Contents/MacOS/stable'), 'Warp');
    assert.strictEqual(nameOf(detector, '/System/Applications/Safari.app/Contents/MacOS/Safari'), 'Safari');
    assert.strictEqual(
      detector.extractAppName('/Applications/Codex.app/Contents/Frameworks/X.framework/Helpers/Codex (Renderer).app/Contents/MacOS/Codex (Renderer)'),
      'Codex'
    );
    assert.strictEqual(nameOf(detector, '/usr/bin/vim'), 'Vim');
    assert.strictEqual(nameOf(detector, '"C:\\Program Files\\Microsoft VS Code\\Code.exe" --flag'), 'VS Code');
  });

  it('rejects helpers, widgets, frameworks, and generic names', () => {
    assert.strictEqual(nameOf(detector, 'stable'), null);
    assert.strictEqual(nameOf(detector, 'T3'), null);
    assert.strictEqual(nameOf(detector, 'Affinity Publisher Helper'), null);
    assert.strictEqual(nameOf(detector, 'SomeXPCService'), null);
    assert.strictEqual(nameOf(detector, 'something.framework/binary'), null);
    assert.strictEqual(
      nameOf(detector, '/Applications/Microsoft Word.app/Contents/PlugIns/WordWidget_mac.appex/Contents/MacOS/WordWidget_mac'),
      null
    );
    assert.strictEqual(
      nameOf(detector, '/Applications/T3 Code (Nightly).app/Contents/Frameworks/T3 Code (Nightly) Helper.app/Contents/MacOS/T3 Code (Nightly) Helper'),
      null
    );
    assert.strictEqual(nameOf(detector, '/usr/bin/something'), null);
    assert.strictEqual(nameOf(detector, ''), null);
    assert.strictEqual(nameOf(detector, null), null);
  });
});

describe('AppDetector.sample', () => {
  it('reads running and frontmost apps plus idle time on macOS', async() => {
    const calls = [];
    const detector = new AppDetector({
      platform: 'darwin',
      execFile: fakeExec({
        ioreg: '    | |   "HIDIdleTime" = 42000000000\n',
        osascript: JSON.stringify({ front: 'Cursor', apps: ['Finder', 'Google Chrome', 'Cursor', 'ChatGPT'] })
      }, calls)
    });

    const sample = await detector.sample();

    assert.deepStrictEqual(sample, {
      focused: 'cursor',
      focusSupported: true,
      idleSeconds: 42,
      running: ['chatgpt', 'cursor', 'chrome']
    });
    const osascript = calls.find(call => call.command === 'osascript');
    assert.ok(osascript.args.includes('JavaScript'));
    assert.ok(osascript.args.some(arg => arg.includes('frontmostApplication')));
  });

  it('reports no focus when an unknown app is frontmost', async() => {
    const detector = new AppDetector({
      platform: 'darwin',
      execFile: fakeExec({
        ioreg: new Error('no ioreg'),
        osascript: JSON.stringify({ front: 'Finder', apps: ['Finder', 'Safari'] })
      })
    });

    const sample = await detector.sample();

    assert.strictEqual(sample.focused, null);
    assert.strictEqual(sample.focusSupported, true);
    assert.strictEqual(sample.idleSeconds, null);
    assert.deepStrictEqual(sample.running, ['safari']);
  });

  it('falls back to ps on macOS when the workspace query fails', async() => {
    const messages = [];
    const detector = new AppDetector({
      platform: 'darwin',
      logger: { warn: message => messages.push(message), debug() {} },
      execFile: fakeExec({
        ioreg: '',
        osascript: new Error('temporary workspace failure'),
        ps: [
          '/Applications/Microsoft Word.app/Contents/PlugIns/WordWidget_mac.appex/Contents/MacOS/WordWidget_mac',
          '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
          '/Applications/ChatGPT.app/Contents/Frameworks/ChatGPT Helper.app/Contents/MacOS/ChatGPT Helper',
          '/Applications/Ghostty.app/Contents/MacOS/ghostty'
        ].join('\n')
      })
    });

    const sample = await detector.sample();
    await detector.sample();

    assert.deepStrictEqual(sample.running, ['chatgpt', 'ghostty']);
    assert.strictEqual(sample.focusSupported, false);
    assert.strictEqual(messages.length, 1, 'warns only once');
  });

  it('parses windowed processes, focus, and idle time on Windows', async() => {
    const calls = [];
    const detector = new AppDetector({
      platform: 'win32',
      execFile: fakeExec({
        'powershell.exe': 'F:Code\r\nI:12\r\nA:Code\r\nA:msedge\r\nA:explorer\r\nS:native\r\n'
      }, calls)
    });

    const sample = await detector.sample();

    assert.deepStrictEqual(sample, {
      focused: 'vscode',
      focusSupported: true,
      idleSeconds: 12,
      running: ['vscode', 'edge']
    });
    const args = calls[0].args;
    assert.ok(args.includes('-EncodedCommand'));
    assert.strictEqual(
      Buffer.from(args.at(-1), 'base64').toString('utf16le'),
      WINDOWS_SCRIPT
    );
    assert.strictEqual(encodePowerShell('x'), Buffer.from('x', 'utf16le').toString('base64'));
  });

  it('falls back to open apps when Windows native APIs fail to load', async() => {
    const messages = [];
    const detector = new AppDetector({
      platform: 'win32',
      logger: { warn: message => messages.push(message), debug() {} },
      execFile: fakeExec({ 'powershell.exe': 'A:Code\r\nA:figma\r\n' })
    });

    const sample = await detector.sample();

    assert.strictEqual(sample.focusSupported, false);
    assert.deepStrictEqual(sample.running, ['vscode', 'figma']);
    assert.match(messages[0], /Windows focus and idle APIs are unavailable/);
  });

  it('uses xprop and xprintidle on Linux when a display is available', async() => {
    const detector = new AppDetector({
      platform: 'linux',
      env: { DISPLAY: ':0' },
      execFile: fakeExec({
        ps: '  101 /usr/share/code/code --type=zygote\n  202 /usr/bin/ghostty\n  303 /usr/lib/firefox/firefox\n',
        xprintidle: '65000\n',
        xprop: args => args[0] === '-root' ?
          '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x3a00007\n' :
          '_NET_WM_PID(CARDINAL) = 202\n'
      })
    });

    const sample = await detector.sample();

    assert.deepStrictEqual(sample, {
      focused: 'ghostty',
      focusSupported: true,
      idleSeconds: 65,
      running: ['vscode', 'ghostty', 'firefox']
    });
  });

  it('degrades gracefully on Linux without X11 tools', async() => {
    const calls = [];
    const detector = new AppDetector({
      platform: 'linux',
      env: { DISPLAY: ':0' },
      execFile: fakeExec({ ps: '1 /usr/bin/zed\n' }, calls)
    });

    const first = await detector.sample();
    await detector.sample();

    assert.deepStrictEqual(first, {
      focused: null,
      focusSupported: false,
      idleSeconds: null,
      running: ['zed']
    });
    assert.strictEqual(calls.filter(call => call.command === 'xprop').length, 1, 'missing tools are not retried');
    assert.strictEqual(calls.filter(call => call.command === 'xprintidle').length, 1);
  });

  it('reports a desktop with no focused window', async() => {
    const detector = new AppDetector({
      platform: 'linux',
      env: { DISPLAY: ':0' },
      execFile: fakeExec({
        ps: '1 /usr/bin/zed\n',
        xprintidle: 'n/a',
        xprop: '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0\n'
      })
    });

    const sample = await detector.sample();

    assert.strictEqual(sample.focusSupported, true);
    assert.strictEqual(sample.focused, null);
    assert.strictEqual(sample.idleSeconds, null);
  });

  it('never reports hidden apps', async() => {
    const detector = new AppDetector({
      platform: 'darwin',
      hiddenIds: ['safari'],
      execFile: fakeExec({
        ioreg: '',
        osascript: JSON.stringify({ front: 'Safari', apps: ['Safari', 'Zed'] })
      })
    });

    const sample = await detector.sample();

    assert.deepStrictEqual(sample.running, ['zed']);
    assert.strictEqual(sample.focused, null);
  });
});
