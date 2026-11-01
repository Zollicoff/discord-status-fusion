const { describe, it } = require('node:test');
const assert = require('node:assert');

const { Logger, createFileSink, rotateLog } = require('../src/logger');

function collectingSink(messages) {
  return {
    error: message => messages.push(message),
    log: message => messages.push(message),
    warn: message => messages.push(message)
  };
}

describe('Logger', () => {
  it('filters messages below the configured verbosity', () => {
    const messages = [];
    const logger = new Logger({ level: 'warn', sink: collectingSink(messages) });

    logger.error('failed');
    logger.warn('careful');
    logger.info('hidden');

    assert.deepStrictEqual(messages, ['[ERROR] failed', '[WARN] careful']);
  });

  it('adds timestamps and runs the pre-write hook', () => {
    const messages = [];
    let hookCalls = 0;
    const logger = new Logger({
      beforeWrite: () => {
        hookCalls += 1;
      },
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      sink: collectingSink(messages),
      timestamps: true
    });

    logger.info('hello');
    logger.debug('hidden');

    assert.deepStrictEqual(messages, ['2026-01-02T03:04:05.000Z [INFO] hello']);
    assert.strictEqual(hookCalls, 1);
  });

  it('appends to files without throwing on failure', () => {
    const lines = [];
    const sink = createFileSink('/logs/dsf.log', {
      appendFileSync: (_file, line) => lines.push(line)
    });
    sink.log('one');
    sink.error('two');
    assert.deepStrictEqual(lines, ['one\n', 'two\n']);

    const broken = createFileSink('/logs/dsf.log', {
      appendFileSync() {
        throw new Error('disk full');
      }
    });
    assert.doesNotThrow(() => broken.warn('three'));
  });

  it('rotates oversized logs by copy and truncate', () => {
    const calls = [];
    const fs = {
      copyFileSync: (from, to) => calls.push(['copy', from, to]),
      statSync: () => ({ size: 11 }),
      truncateSync: (file, size) => calls.push(['truncate', file, size])
    };

    rotateLog('/logs/dsf.log', fs, 10);
    assert.deepStrictEqual(calls, [
      ['copy', '/logs/dsf.log', '/logs/dsf.log.1'],
      ['truncate', '/logs/dsf.log', 0]
    ]);

    calls.length = 0;
    rotateLog('/logs/dsf.log', { ...fs, statSync: () => ({ size: 5 }) }, 10);
    assert.deepStrictEqual(calls, []);
    assert.doesNotThrow(() => rotateLog('/missing.log', {
      statSync() {
        throw new Error('ENOENT');
      }
    }));
  });
});
