const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runCli, tailFile } = require('../src/cli');

function createController(calls, options = {}) {
  return {
    restart: async() => {
      calls.push('restart');
      return true;
    },
    start: async() => {
      calls.push('start');
      return true;
    },
    status: (statusOptions = {}) => {
      calls.push(statusOptions.quiet ? 'status:quiet' : 'status');
      return options.running ?? true;
    },
    stop: async() => {
      calls.push('stop');
      return true;
    }
  };
}

function createService(calls, options = {}) {
  return {
    serviceFile: '/home/me/.config/systemd/user/discord-status-fusion.service',
    install: () => {
      calls.push('install');
      return '/home/me/.config/systemd/user/discord-status-fusion.service';
    },
    isInstalled: () => options.installed ?? false,
    uninstall: () => {
      calls.push('uninstall');
      return options.installed ?? false;
    }
  };
}

function createLogger(messages) {
  return {
    error: message => messages.push(message),
    log: message => messages.push(message)
  };
}

describe('CLI command routing', () => {
  it('dispatches daemon commands', async() => {
    const calls = [];
    const processRef = { exitCode: 0 };
    const options = {
      controller: createController(calls),
      logger: createLogger([]),
      paths: {},
      processRef,
      service: createService(calls)
    };

    for (const command of ['start', 'stop', 'restart', 'status']) {
      await runCli({ ...options, command });
    }

    assert.deepStrictEqual(calls, ['start', 'stop', 'restart', 'status']);
    assert.strictEqual(processRef.exitCode, 0);
  });

  it('stops a manual daemon before installing the login service', async() => {
    const calls = [];
    const messages = [];

    const succeeded = await runCli({
      command: 'install',
      controller: createController(calls, { running: true }),
      logger: createLogger(messages),
      paths: {},
      processRef: { exitCode: 0 },
      service: createService(calls)
    });

    assert.strictEqual(succeeded, true);
    assert.deepStrictEqual(calls, ['status:quiet', 'stop', 'install']);
    assert.ok(messages.some(message => /start automatically/.test(message)));
  });

  it('reports uninstall results', async() => {
    const messages = [];
    const base = {
      command: 'uninstall',
      controller: createController([]),
      logger: createLogger(messages),
      paths: {},
      processRef: { exitCode: 0 }
    };

    await runCli({ ...base, service: createService([], { installed: false }) });
    await runCli({ ...base, service: createService([], { installed: true }) });

    assert.match(messages[0], /No login service/);
    assert.match(messages[1], /Removed login service/);
  });

  it('runs the preview without touching the daemon', async() => {
    let previewed = false;
    const succeeded = await runCli({
      command: 'preview',
      controller: createController([]),
      logger: createLogger([]),
      paths: {},
      previewModule: {
        preview: async() => {
          previewed = true;
        }
      },
      processRef: { exitCode: 0 },
      service: createService([])
    });

    assert.strictEqual(succeeded, true);
    assert.strictEqual(previewed, true);
  });

  it('prints the tail of the log file', async() => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsf-cli-'));
    const logFile = path.join(directory, 'dsf.log');
    fs.writeFileSync(logFile, Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n') + '\n');
    const messages = [];

    try {
      await runCli({
        argv: ['logs', '3'],
        controller: createController([]),
        logger: createLogger(messages),
        paths: { logFile },
        processRef: { exitCode: 0 },
        service: createService([])
      });
      assert.strictEqual(messages[0], 'line 58\nline 59\nline 60');
      assert.deepStrictEqual(tailFile(logFile, 1), ['line 60']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('sets a failing exit code for unknown commands and thrown errors', async() => {
    const messages = [];
    const processRef = { exitCode: 0 };
    const base = { logger: createLogger(messages), paths: {}, processRef, service: createService([]) };

    assert.strictEqual(await runCli({ ...base, command: 'wat', controller: {} }), false);
    assert.strictEqual(processRef.exitCode, 1);
    assert.match(messages[0], /Unknown command "wat"/);

    const failing = {
      start: async() => {
        throw new Error('boom');
      }
    };
    assert.strictEqual(await runCli({ ...base, command: 'start', controller: failing }), false);
    assert.match(messages[1], /dsf start failed: boom/);
  });
});
