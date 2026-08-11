const { describe, it } = require('node:test');
const assert = require('node:assert');

const { Logger } = require('../src/logger');

describe('Logger', () => {
  it('filters messages below the configured verbosity', () => {
    const messages = [];
    const sink = {
      error: message => messages.push(message),
      log: message => messages.push(message),
      warn: message => messages.push(message)
    };
    const logger = new Logger({ level: 'warn', sink });

    logger.error('failed');
    logger.warn('careful');
    logger.info('hidden');

    assert.deepStrictEqual(messages, ['[ERROR] failed', '[WARN] careful']);
  });
});
