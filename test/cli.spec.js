const { describe, it } = require('node:test');
const assert = require('node:assert');

const { runCli } = require('../src/cli');

describe('CLI command routing', () => {
  it('dispatches known commands', async() => {
    const calls = [];
    const controller = {
      restart: async() => {
        calls.push('restart');
        return true;
      },
      start: async() => {
        calls.push('start');
        return true;
      },
      status: () => {
        calls.push('status');
        return true;
      },
      stop: async() => {
        calls.push('stop');
        return true;
      }
    };
    const processRef = { exitCode: 0 };

    await runCli({ command: 'restart', controller, processRef });

    assert.deepStrictEqual(calls, ['restart']);
    assert.strictEqual(processRef.exitCode, 0);
  });

  it('sets a failing exit code for unknown commands', async() => {
    const messages = [];
    const processRef = { exitCode: 0 };

    assert.strictEqual(await runCli({
      command: 'wat',
      controller: {},
      logger: { error: message => messages.push(message) },
      processRef
    }), false);

    assert.strictEqual(processRef.exitCode, 1);
    assert.match(messages[0], /Unknown command/);
  });
});
