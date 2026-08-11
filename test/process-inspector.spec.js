const { describe, it } = require('node:test');
const assert = require('node:assert');

const { ProcessInspector } = require('../src/cli/process-inspector');

describe('ProcessInspector', () => {
  it('matches the configured main file as a complete command argument', () => {
    const inspector = new ProcessInspector({
      mainFile: '/project/main.js',
      processRef: { kill() {} }
    });

    assert.strictEqual(inspector.matchesCommand('/usr/bin/node /project/main.js'), true);
    assert.strictEqual(inspector.matchesCommand('/usr/bin/node "/project/main.js"'), true);
    assert.strictEqual(inspector.matchesCommand('/usr/bin/node /project/main.js.backup'), false);
    assert.strictEqual(inspector.matchesCommand('/usr/bin/node /tmp/main.js'), false);
  });

  it('requires both a live PID and the expected command', () => {
    const inspector = new ProcessInspector({
      execFileSync: () => '/usr/bin/node /project/main.js\n',
      mainFile: '/project/main.js',
      processRef: { kill() {} }
    });

    assert.strictEqual(inspector.isManagedProcess({ pid: 1234 }), true);
    assert.strictEqual(inspector.isManagedProcess(null), false);
  });
});
