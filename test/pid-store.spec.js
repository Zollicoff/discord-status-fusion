const { describe, it } = require('node:test');
const assert = require('node:assert');

const { PidStore, parsePidRecord } = require('../src/cli/pid-store');

describe('PidStore', () => {
  it('parses legacy and structured PID records', () => {
    assert.deepStrictEqual(parsePidRecord('1234\n'), { pid: 1234 });
    assert.deepStrictEqual(
      parsePidRecord('{"pid":4321,"startedAt":"now"}'),
      { pid: 4321, startedAt: 'now' }
    );
    assert.strictEqual(parsePidRecord('not-a-pid'), null);
  });

  it('writes private records and removes them', () => {
    let content = null;
    let mode = null;
    const fs = {
      chmodSync: (_path, value) => {
        mode = value;
      },
      existsSync: () => content !== null,
      readFileSync: () => content,
      unlinkSync: () => {
        content = null;
      },
      writeFileSync: (_path, value, options) => {
        content = value;
        mode = options.mode;
      }
    };
    const store = new PidStore('/tmp/dsf-test.pid', fs);

    store.write(1234, '/project/main.js');

    assert.strictEqual(mode, 0o600);
    assert.strictEqual(store.read().pid, 1234);
    store.remove();
    assert.strictEqual(store.exists(), false);
  });
});
