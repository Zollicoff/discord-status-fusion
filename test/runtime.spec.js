const { EventEmitter } = require('events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { registerProcessHandlers, run } = require('../src/runtime');

class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.exitCode = 0;
    this.exitedWith = null;
    this.stdout = { isTTY: false };
  }

  exit(code) {
    this.exitedWith = code;
  }
}

const silentLogger = {
  error() {},
  info() {},
  verbose() {},
  warn() {}
};

describe('runtime', () => {
  it('rejects invalid configuration before creating the application', async() => {
    const processRef = new FakeProcess();

    const app = await run({ env: {}, logger: silentLogger, processRef });

    assert.strictEqual(app, null);
    assert.strictEqual(processRef.exitCode, 1);
  });

  it('wires dependencies and starts the application', async() => {
    const calls = [];
    const processRef = new FakeProcess();
    const app = await run({
      dependencies: {
        activityGenerator: {
          generateActivity: async() => ({
            details: 'Using ChatGPT',
            state: 'Working on projects'
          })
        },
        clearInterval: timer => calls.push(`clear:${timer}`),
        detector: { getInterestingApps: async() => ['ChatGPT'] },
        discord: {
          close: async() => calls.push('close'),
          connect: async() => calls.push('connect'),
          setActivity: async activity => calls.push(activity.details)
        },
        music: { getCurrentMusic: async() => null },
        setInterval: () => 7,
        spinner: { start() {}, stop() {} }
      },
      env: { DISCORD_CLIENT_ID: '12345678901234567' },
      logger: silentLogger,
      processRef
    });

    assert.ok(app);
    assert.deepStrictEqual(calls.slice(0, 2), ['connect', 'Using ChatGPT']);
    await app.stop();
    assert.ok(calls.includes('clear:7'));
    assert.ok(calls.includes('close'));
  });

  it('stops once and exits when a signal handler runs', async() => {
    let stopCount = 0;
    const processRef = new FakeProcess();
    const shutdown = registerProcessHandlers({
      stop: async() => {
        stopCount += 1;
      }
    }, { logger: silentLogger, processRef });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    assert.strictEqual(stopCount, 1);
    assert.strictEqual(processRef.exitedWith, 0);
  });
});
