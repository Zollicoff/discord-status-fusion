const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock child_process for testing
const ProcessDetector = require('../detector');

describe('ProcessDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ProcessDetector();
  });

  describe('isProfessionalApp', () => {
    it('should identify VS Code as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('code'), true);
      assert.strictEqual(detector.isProfessionalApp('Code'), true);
    });

    it('should identify Cursor as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('cursor'), true);
      assert.strictEqual(detector.isProfessionalApp('Cursor'), true);
    });

    it('should identify Zed as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('zed'), true);
      assert.strictEqual(detector.isProfessionalApp('Zed'), true);
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

    it('should identify Warp Terminal (stable) as professional app', () => {
      assert.strictEqual(detector.isProfessionalApp('stable'), true);
    });

    it('should reject system paths', () => {
      assert.strictEqual(detector.isProfessionalApp('/System/Library/something'), false);
      assert.strictEqual(detector.isProfessionalApp('/usr/bin/something'), false);
      assert.strictEqual(detector.isProfessionalApp('/Library/something'), false);
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
    it('should return correct command structure for current platform', () => {
      const { command, args } = detector.getProcessCommand();
      assert.ok(typeof command === 'string');
      assert.ok(Array.isArray(args));
      assert.ok(args.length > 0);
    });
  });

  describe('parseProcessOutput', () => {
    it('should parse Unix process output', () => {
      // Skip if on Windows
      if (process.platform === 'win32') return;

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

    it('should filter out COMM header', () => {
      if (process.platform === 'win32') return;

      const output = `COMM
node`;
      const result = detector.parseProcessOutput(output);
      assert.ok(!result.includes('COMM'));
    });
  });
});
