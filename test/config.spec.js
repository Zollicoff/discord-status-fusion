const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  DEFAULTS,
  loadConfig,
  parseEnvInteger,
  validateConfig
} = require('../src/config');

describe('configuration', () => {
  it('loads defaults and the Discord application ID', () => {
    const result = loadConfig({ DISCORD_CLIENT_ID: '12345678901234567' });

    assert.deepStrictEqual(result.config, {
      discordClientId: '12345678901234567',
      forceUpdateInterval: DEFAULTS.forceUpdateInterval,
      logLevel: DEFAULTS.logLevel,
      updateInterval: DEFAULTS.updateInterval
    });
    assert.deepStrictEqual(result.warnings, []);
  });

  it('replaces invalid numeric and log-level values with defaults', () => {
    const result = loadConfig({
      DISCORD_CLIENT_ID: '12345678901234567',
      FORCE_UPDATE_INTERVAL: 'fast',
      LOG_LEVEL: 'everything',
      UPDATE_INTERVAL: '500'
    });

    assert.strictEqual(result.config.updateInterval, DEFAULTS.updateInterval);
    assert.strictEqual(result.config.forceUpdateInterval, DEFAULTS.forceUpdateInterval);
    assert.strictEqual(result.config.logLevel, DEFAULTS.logLevel);
    assert.strictEqual(result.warnings.length, 3);
  });

  it('parses valid bounded integers', () => {
    assert.deepStrictEqual(parseEnvInteger('VALUE', '2500', 10000, 1000), {
      value: 2500,
      warning: null
    });
    assert.notStrictEqual(parseEnvInteger('VALUE', '2500ms', 10000, 1000).warning, null);
  });

  it('returns actionable Discord ID validation errors', () => {
    assert.deepStrictEqual(validateConfig({ discordClientId: '' }), ['DISCORD_CLIENT_ID is required']);
    assert.deepStrictEqual(
      validateConfig({ discordClientId: 'your_discord_application_id_here' }),
      ['DISCORD_CLIENT_ID still contains the example placeholder']
    );
    assert.deepStrictEqual(
      validateConfig({ discordClientId: 'invalid' }),
      ['DISCORD_CLIENT_ID must be a 17-19 digit Discord application ID']
    );
    assert.deepStrictEqual(validateConfig({ discordClientId: '12345678901234567' }), []);
  });
});
