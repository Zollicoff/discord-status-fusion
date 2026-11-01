const { describe, it } = require('node:test');
const assert = require('node:assert');
const EventEmitter = require('events');

const {
  acquireInstanceLock,
  createApplication,
  parseArgs,
  registerProcessHandlers,
  resolveHiddenApps,
  run
} = require('../src/runtime');

const CLIENT_ID = '12345678901234567';

function createLogger() {
  const messages = [];
  const push = level => message => messages.push(`${level}: ${message}`);
  return {
    logger: { debug: push('debug'), error: push('error'), info: push('info'), verbose() {}, warn: push('warn') },
    messages
  };
}

function memoryPidStore(initial = null) {
  let record = initial;
  return {
    read: () => record,
    remove: () => {
      record = null;
    },
    write: pid => {
      record = { pid };
    },
    get record() {
      return record;
    }
  };
}

function fakeDependencies() {
  return {
    detector: { sample: async() => ({ running: ['zed'], focused: 'zed', focusSupported: true, idleSeconds: 0 }) },
    discord: { start() {}, setActivity: async() => true, stop: async() => {} },
    music: { getCurrentMusic: async() => null },
    setInterval: () => 1,
    clearInterval() {}
  };
}

describe('runtime', () => {
  it('parses CLI flags', () => {
    assert.deepStrictEqual(parseArgs(['--verbose', '--log-file=/tmp/x.log']), {
      logFile: '/tmp/x.log',
      verbose: true
    });
    assert.deepStrictEqual(parseArgs([]), { logFile: null, verbose: false });
  });

  it('resolves hidden apps and warns about unknown names', () => {
    const { logger, messages } = createLogger();
    assert.deepStrictEqual(resolveHiddenApps(['Safari', 'vscode', 'Nope'], logger), ['safari', 'vscode']);
    assert.match(messages[0], /HIDE_APPS entry "Nope"/);
  });

  it('wires a complete application from configuration', async() => {
    const { logger } = createLogger();
    const app = createApplication({
      appIconUrl: '',
      discordClientId: CLIENT_ID,
      focusHalfLife: 600000,
      hideApps: [],
      idleTimeout: 600000,
      largeImage: '',
      logLevel: 'info',
      maxApps: 3,
      showMusic: true,
      statusDisplay: 'details',
      updateInterval: 10000
    }, { ...fakeDependencies(), logger, stream: { isTTY: false } });

    const { activity } = await app.compute();
    assert.strictEqual(activity.state, 'Zed');
  });

  it('refuses to start without a valid client id', async() => {
    const { logger, messages } = createLogger();
    const processRef = { exitCode: 0, pid: 1 };

    const result = await run({ argv: [], env: {}, logger, processRef, stream: { isTTY: true } });

    assert.strictEqual(result, null);
    assert.strictEqual(processRef.exitCode, 1);
    assert.match(messages.find(message => message.startsWith('error')), /DISCORD_CLIENT_ID is required/);
  });

  it('starts, holds the instance lock, and releases it on shutdown', async() => {
    const { logger } = createLogger();
    const processRef = Object.assign(new EventEmitter(), { exitCode: 0, pid: 99, exit: code => { processRef.exited = code; } });
    const pidStore = memoryPidStore();

    const app = await run({
      argv: [],
      dependencies: fakeDependencies(),
      env: { DISCORD_CLIENT_ID: CLIENT_ID },
      inspector: { isManagedProcess: () => false },
      logger,
      paths: { mainFile: '/project/main.js', pidFile: '/state/dsf.pid', logFile: '/state/dsf.log' },
      pidStore,
      processRef,
      stream: { isTTY: true }
    });

    assert.ok(app);
    assert.deepStrictEqual(pidStore.record, { pid: 99 });

    processRef.emit('SIGTERM');
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(processRef.exited, 0);
    assert.strictEqual(pidStore.record, null);
  });

  it('exits cleanly when another instance is already running', async() => {
    const { logger, messages } = createLogger();
    const processRef = { exitCode: 0, pid: 99 };

    const result = await run({
      argv: [],
      env: { DISCORD_CLIENT_ID: CLIENT_ID },
      inspector: { isManagedProcess: () => true },
      logger,
      paths: { mainFile: '/project/main.js' },
      pidStore: memoryPidStore({ pid: 42 }),
      processRef,
      stream: { isTTY: true }
    });

    assert.strictEqual(result, null);
    assert.strictEqual(processRef.exitCode, 0);
    assert.ok(messages.some(message => /already running \(PID: 42\)/.test(message)));
  });

  it('reclaims stale or self-owned locks', () => {
    const stale = memoryPidStore({ pid: 42 });
    const lock = acquireInstanceLock({ inspector: { isManagedProcess: () => false }, mainFile: '/m', pid: 7, pidStore: stale });
    assert.strictEqual(lock.acquired, true);
    assert.deepStrictEqual(stale.record, { pid: 7 });

    const own = memoryPidStore({ pid: 7 });
    assert.strictEqual(acquireInstanceLock({ inspector: { isManagedProcess: () => true }, mainFile: '/m', pid: 7, pidStore: own }).acquired, true);

    const other = memoryPidStore();
    const second = acquireInstanceLock({ inspector: { isManagedProcess: () => false }, mainFile: '/m', pid: 7, pidStore: other });
    other.write(8);
    second.release();
    assert.deepStrictEqual(other.record, { pid: 8 }, 'never removes another process\'s record');
  });

  it('shuts down once and exits non-zero after an uncaught exception', async() => {
    const processRef = Object.assign(new EventEmitter(), { exit: code => exits.push(code) });
    const exits = [];
    let stops = 0;
    const { logger } = createLogger();
    const shutdown = registerProcessHandlers({ stop: async() => { stops += 1; } }, { logger, processRef });

    processRef.emit('uncaughtException', new Error('boom'));
    await shutdown('SIGTERM');
    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(stops, 1);
    assert.deepStrictEqual(exits, [1]);
  });
});
