const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const ProcessDetector = require('../src/core/detector');

describe('ProcessDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ProcessDetector();
  });

  describe('isProfessionalApp', () => {
    it('should identify VS Code as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('code'), true);
      assert.strictEqual(detector.isProfessionalApp('Code'), true);
      assert.strictEqual(detector.getDisplayAppName('code'), 'VS Code');
    });

    it('should identify Cursor as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('cursor'), true);
      assert.strictEqual(detector.isProfessionalApp('Cursor'), true);
    });

    it('should identify Zed as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('zed'), true);
      assert.strictEqual(detector.isProfessionalApp('Zed'), true);
      assert.strictEqual(detector.getDisplayAppName('zed'), 'Zed');
    });

    it('should identify browsers as professional apps', () => {
      assert.strictEqual(detector.isProfessionalApp('chrome'), true);
      assert.strictEqual(detector.isProfessionalApp('Safari'), true);
      assert.strictEqual(detector.isProfessionalApp('Firefox'), true);
      assert.strictEqual(detector.isProfessionalApp('Arc'), true);
    });

    it('should identify Adobe apps as professional', () => {
      assert.strictEqual(detector.isProfessionalApp('Adobe Photoshop'), true);
      assert.strictEqual(detector.isProfessionalApp('Adobe Illustrator'), true);
    });

    it('should not treat generic stable processes as Warp', () => {
      assert.strictEqual(detector.isProfessionalApp('stable'), false);
      assert.strictEqual(detector.getDisplayAppName('stable'), null);
    });

    it('should identify Warp by its app name only', () => {
      assert.strictEqual(detector.isProfessionalApp('Warp'), true);
      assert.strictEqual(detector.getDisplayAppName('/Applications/Warp.app/Contents/MacOS/stable'), 'Warp');
    });

    it('should identify ChatGPT, legacy Codex, and Ghostty as professional apps', () => {
      assert.strictEqual(detector.isProfessionalApp('ChatGPT'), true);
      assert.strictEqual(detector.isProfessionalApp('Codex'), true);
      assert.strictEqual(detector.isProfessionalApp('ghostty'), true);
      assert.strictEqual(detector.getDisplayAppName('ChatGPT'), 'ChatGPT');
      assert.strictEqual(detector.getDisplayAppName('ghostty'), 'Ghostty');
    });

    it('should identify canonical productivity and cross-platform aliases', () => {
      assert.strictEqual(detector.getDisplayAppName('Notion Calendar'), 'Notion Calendar');
      assert.strictEqual(detector.getDisplayAppName('WINWORD'), 'Microsoft Word');
      assert.strictEqual(detector.getDisplayAppName('POWERPNT'), 'Microsoft PowerPoint');
      assert.strictEqual(detector.getDisplayAppName('WindowsTerminal'), 'Windows Terminal');
    });

    it('should normalize supported Affinity versions without broad prefix matching', () => {
      assert.strictEqual(detector.getDisplayAppName('Affinity Designer 2'), 'Affinity Designer');
      assert.strictEqual(detector.getDisplayAppName('Affinity Photo'), 'Affinity Photo');
      assert.strictEqual(detector.getDisplayAppName('Affinity Publisher Helper'), null);
    });

    it('should reject macOS widget extension processes inside app bundles', () => {
      const officeWidget = '/Applications/Microsoft Word.app/Contents/PlugIns/WordWidget_mac.appex/Contents/MacOS/WordWidget_mac';
      assert.strictEqual(detector.isProfessionalApp(officeWidget), false);
      assert.strictEqual(detector.getDisplayAppName(officeWidget), null);
    });

    it('should reject unmatched system paths through the whitelist', () => {
      assert.strictEqual(detector.isProfessionalApp('/System/Library/something'), false);
      assert.strictEqual(detector.isProfessionalApp('/usr/bin/something'), false);
      assert.strictEqual(detector.isProfessionalApp('/Library/something'), false);
    });

    it('should allow whitelisted apps from system paths', () => {
      assert.strictEqual(detector.getDisplayAppName('/usr/bin/vim'), 'Vim');
      assert.strictEqual(
        detector.getDisplayAppName('/System/Applications/Safari.app/Contents/MacOS/Safari'),
        'Safari'
      );
    });

    it('should reject helper processes', () => {
      assert.strictEqual(detector.isProfessionalApp('SomeXPCService'), false);
      assert.strictEqual(detector.isProfessionalApp('SomeHelperTool'), false);
    });

    it('should reject framework paths', () => {
      assert.strictEqual(detector.isProfessionalApp('something.framework/binary'), false);
    });

    it('should reject random process names', () => {
      assert.strictEqual(detector.isProfessionalApp('random_daemon'), false);
      assert.strictEqual(detector.isProfessionalApp('some_background_process'), false);
    });
  });

  describe('extractAppName', () => {
    it('should extract app name from macOS bundle path', () => {
      const result = detector.extractAppName('/Applications/Cursor.app/Contents/MacOS/Cursor');
      assert.strictEqual(result, 'Cursor');
    });

    it('should collapse helper processes to the outer app bundle', () => {
      const result = detector.extractAppName('/Applications/Codex.app/Contents/Frameworks/Codex Framework.framework/Versions/149.0.7827.197/Helpers/Codex (Renderer).app/Contents/MacOS/Codex (Renderer)');
      assert.strictEqual(result, 'Codex');
    });

    it('should extract app name from .app directory', () => {
      const result = detector.extractAppName('/Applications/Visual Studio Code.app');
      assert.strictEqual(result, 'Visual Studio Code');
    });

    it('should remove .exe extension', () => {
      const result = detector.extractAppName('code.exe');
      assert.strictEqual(result, 'code');
    });

    it('should return name as-is if no special path', () => {
      const result = detector.extractAppName('node');
      assert.strictEqual(result, 'node');
    });
  });

  describe('getProcessCommand', () => {
    it('should use PowerShell instead of deprecated WMIC on Windows', () => {
      const windowsDetector = new ProcessDetector({ platform: 'win32' });
      const { command, args } = windowsDetector.getProcessCommand();

      assert.strictEqual(command, 'powershell.exe');
      assert.ok(args.some(arg => arg.includes('Get-Process')));
    });

    it('should request full command lines on Unix', () => {
      const linuxDetector = new ProcessDetector({ platform: 'linux' });
      const { command, args } = linuxDetector.getProcessCommand();

      assert.strictEqual(command, 'ps');
      assert.ok(args.includes('command='));
    });
  });

  describe('parseProcessOutput', () => {
    it('should parse process output and remove headers', () => {
      const output = `COMM
node
code
cursor
/System/Library/something`;

      const result = detector.parseProcessOutput(output);
      assert.ok(Array.isArray(result));
      assert.ok(result.includes('node'));
      assert.ok(result.includes('code'));
      assert.ok(result.includes('cursor'));
    });

    it('should preserve full command lines until helper filtering', () => {
      const output = `/Applications/Codex.app/Contents/MacOS/Codex
/Applications/Codex.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Renderer).app/Contents/MacOS/Codex (Renderer)
/Applications/Ghostty.app/Contents/MacOS/ghostty`;

      const result = detector.parseProcessOutput(output);
      assert.strictEqual(result[0], '/Applications/Codex.app/Contents/MacOS/Codex');
      assert.ok(result[1].includes('/Frameworks/'));
    });

    it('should filter out COMM header', () => {
      const output = `COMM
node`;
      const result = detector.parseProcessOutput(output);
      assert.ok(!result.includes('COMM'));
    });
  });

  describe('getInterestingApps', () => {
    it('should use the native macOS workspace application list', async() => {
      const calls = [];
      const execFile = (command, args, _options, callback) => {
        calls.push({ command, args });
        callback(null, 'Finder\nChatGPT\nGhostty\nChatGPT\n');
      };
      const macDetector = new ProcessDetector({ platform: 'darwin', execFile });

      const apps = await macDetector.getInterestingApps();

      assert.deepStrictEqual(apps, ['ChatGPT', 'Ghostty']);
      assert.strictEqual(calls[0].command, 'osascript');
      assert.ok(calls[0].args.includes('JavaScript'));
      assert.ok(calls[0].args.some(arg => arg.includes('NSWorkspace')));
    });

    it('should reject helper and widget paths in the ps fallback', async() => {
      let callCount = 0;
      const execFile = (command, _args, _options, callback) => {
        callCount += 1;
        if (command === 'osascript') {
          callback(new Error('temporary workspace failure'));
          return;
        }

        callback(null, [
          '/Applications/Microsoft Word.app/Contents/PlugIns/WordWidget_mac.appex/Contents/MacOS/WordWidget_mac',
          '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
          '/Applications/ChatGPT.app/Contents/Frameworks/ChatGPT Helper.app/Contents/MacOS/ChatGPT Helper',
          '/Applications/Ghostty.app/Contents/MacOS/ghostty'
        ].join('\n'));
      };
      const macDetector = new ProcessDetector({ platform: 'darwin', execFile });

      const apps = await macDetector.getInterestingApps();

      assert.strictEqual(callCount, 2);
      assert.deepStrictEqual(apps, ['ChatGPT', 'Ghostty']);
    });

    it('should recognize bare executables followed by arguments', () => {
      assert.strictEqual(detector.getDisplayAppName('code --unity-launch'), 'VS Code');
    });
  });
});
