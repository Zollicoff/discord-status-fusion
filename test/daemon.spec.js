const { describe, it } = require('node:test');
const assert = require('node:assert');

const DaemonController = require('../src/cli/daemon');

function createHarness(options = {}) {
  let record = options.record || null;
  let running = options.running || false;
  let removed = false;
  let signaled = false;
  const messages = [];
  const pidStore = {
    exists: () => record !== null,
    read: () => record,
    remove: () => {
      record = null;
      removed = true;
    },
    write: pid => {
      record = { pid };
    }
  };
  const inspector = {
    exists: () => running,
    isManagedProcess: value => Boolean(value && running && options.unrelated !== true)
  };
  const controller = new DaemonController({
    fs: {
      appendFileSync() {},
      closeSync() {},
      openSync: () => 10
    },
    inspector,
    logFile: '/project/status.log',
    logger: {
      error: message => messages.push(message),
      log: message => messages.push(message),
      warn: message => messages.push(message)
    },
    mainFile: '/project/main.js',
    pidStore,
    processRef: {
      execPath: '/usr/bin/node',
      kill: () => {
        signaled = true;
        running = false;
        if (options.killError) {
          throw new Error('process disappeared');
        }
      }
    },
    projectRoot: '/project',
    spawn: () => ({
      pid: 4321,
      once(event, handler) {
        if (event === 'error' && options.spawnError) {
          handler(new Error('spawn failed asynchronously'));
        }
      },
      unref() {
        running = options.exitDuringStartup !== true;
      }
    }),
    startupCheckMs: 0,
    stopTimeoutMs: 100,
    wait: async() => {}
  });

  return {
    controller,
    getRecord: () => record,
    messages,
    wasRemoved: () => removed,
    wasSignaled: () => signaled
  };
}

describe('DaemonController', () => {
  it('starts a detached process and records its PID', async() => {
    const harness = createHarness();

    assert.strictEqual(await harness.controller.start(), true);
    assert.deepStrictEqual(harness.getRecord(), { pid: 4321 });
  });

  it('removes the PID record when startup exits immediately', async() => {
    const harness = createHarness({ exitDuringStartup: true });

    assert.strictEqual(await harness.controller.start(), false);
    assert.strictEqual(harness.getRecord(), null);
  });

  it('reports asynchronous spawn failures and removes the PID record', async() => {
    const harness = createHarness({ spawnError: true });

    assert.strictEqual(await harness.controller.start(), false);
    assert.strictEqual(harness.getRecord(), null);
    assert.ok(harness.messages.some(message => message.includes('spawn failed asynchronously')));
  });

  it('stops only a verified managed process', async() => {
    const harness = createHarness({ record: { pid: 1234 }, running: true });

    assert.strictEqual(await harness.controller.stop(), true);
    assert.strictEqual(harness.wasSignaled(), true);
    assert.strictEqual(harness.wasRemoved(), true);
  });

  it('refuses to signal an unrelated PID', async() => {
    const harness = createHarness({ record: { pid: 1234 }, running: true, unrelated: true });

    assert.strictEqual(await harness.controller.stop(), false);
    assert.strictEqual(harness.wasSignaled(), false);
    assert.strictEqual(harness.wasRemoved(), true);
  });

  it('handles a managed process exiting before SIGTERM is delivered', async() => {
    const harness = createHarness({ record: { pid: 1234 }, running: true, killError: true });

    assert.strictEqual(await harness.controller.stop(), true);
    assert.strictEqual(harness.wasRemoved(), true);
  });
});
