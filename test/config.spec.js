const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  DEFAULTS,
  loadConfig,
  parseEnvBoolean,
  parseEnvInteger,
  parseEnvList,
  validateConfig
} = require('../src/config');

const CLIENT_ID = '12345678901234567';

describe('configuration', () => {
  it('loads defaults and the Discord application ID', () => {
    const result = loadConfig({ DISCORD_CLIENT_ID: ` ${CLIENT_ID} ` });

    assert.deepStrictEqual(result.config, {
      appIconUrl: '',
      discordClientId: CLIENT_ID,
      focusHalfLife: DEFAULTS.focusHalfLife,
      hideApps: [],
      idleTimeout: DEFAULTS.idleTimeout,
      largeImage: '',
      logLevel: DEFAULTS.logLevel,
      maxApps: DEFAULTS.maxApps,
      showMusic: true,
      statusDisplay: 'details',
      updateInterval: DEFAULTS.updateInterval
    });
    assert.deepStrictEqual(result.warnings, []);
  });

  it('parses every supported setting', () => {
    const { config, warnings } = loadConfig({
      APP_ICON_URL: 'https://icons.example/{id}.png',
      DISCORD_CLIENT_ID: CLIENT_ID,
      FOCUS_HALF_LIFE: '300000',
      HIDE_APPS: 'Safari, figma ,,',
      IDLE_TIMEOUT: '0',
      LARGE_IMAGE: 'my_asset',
      LOG_LEVEL: 'DEBUG',
      MAX_APPS: '5',
      SHOW_MUSIC: 'off',
      STATUS_DISPLAY: 'Name',
      UPDATE_INTERVAL: '2500'
    });

    assert.deepStrictEqual(warnings, []);
    assert.strictEqual(config.appIconUrl, 'https://icons.example/{id}.png');
    assert.strictEqual(config.focusHalfLife, 300000);
    assert.deepStrictEqual(config.hideApps, ['Safari', 'figma']);
    assert.strictEqual(config.idleTimeout, 0);
    assert.strictEqual(config.largeImage, 'my_asset');
    assert.strictEqual(config.logLevel, 'debug');
    assert.strictEqual(config.maxApps, 5);
    assert.strictEqual(config.showMusic, false);
    assert.strictEqual(config.statusDisplay, 'name');
    assert.strictEqual(config.updateInterval, 2500);
  });

  it('replaces invalid values with defaults and explains why', () => {
    const { config, warnings } = loadConfig({
      APP_ICON_URL: 'http://insecure.example/icon.png',
      DISCORD_CLIENT_ID: CLIENT_ID,
      LARGE_IMAGE: 'not a key',
      LOG_LEVEL: 'everything',
      MAX_APPS: '9',
      STATUS_DISPLAY: 'banner',
      UPDATE_INTERVAL: '500'
    });

    assert.strictEqual(config.updateInterval, DEFAULTS.updateInterval);
    assert.strictEqual(config.maxApps, DEFAULTS.maxApps);
    assert.strictEqual(config.logLevel, DEFAULTS.logLevel);
    assert.strictEqual(config.statusDisplay, DEFAULTS.statusDisplay);
    assert.strictEqual(config.largeImage, '');
    assert.strictEqual(config.appIconUrl, '');
    assert.strictEqual(warnings.length, 6);
    assert.ok(warnings.some(warning => /MAX_APPS must be an integer between 1 and 6/.test(warning)));
  });

  it('flags retired AI and refresh settings', () => {
    const { warnings } = loadConfig({
      DISCORD_CLIENT_ID: CLIENT_ID,
      FORCE_UPDATE_INTERVAL: '300000',
      GEMINI_API_KEY: 'secret',
      LLM_ENABLED: 'true'
    });

    assert.strictEqual(warnings.length, 3);
    assert.ok(warnings.every(warning => /no longer used/.test(warning)));
    assert.ok(warnings.every(warning => !warning.includes('secret')));
  });

  it('parses primitives', () => {
    assert.deepStrictEqual(parseEnvInteger('VALUE', '2500', 10000, 1000), { value: 2500, warning: null });
    assert.notStrictEqual(parseEnvInteger('VALUE', '2500ms', 10000, 1000).warning, null);
    assert.deepStrictEqual(parseEnvBoolean('FLAG', 'yes', false), { value: true, warning: null });
    assert.notStrictEqual(parseEnvBoolean('FLAG', 'sometimes', false).warning, null);
    assert.deepStrictEqual(parseEnvList(' a, b ,, c '), ['a', 'b', 'c']);
    assert.deepStrictEqual(parseEnvList(undefined), []);
  });

  it('returns actionable Discord ID validation errors', () => {
    assert.match(validateConfig({ discordClientId: '' })[0], /DISCORD_CLIENT_ID is required/);
    assert.deepStrictEqual(
      validateConfig({ discordClientId: 'your_discord_application_id_here' }),
      ['DISCORD_CLIENT_ID still contains the example placeholder']
    );
    assert.match(validateConfig({ discordClientId: '1234' })[0], /17-20 digit/);
    assert.deepStrictEqual(validateConfig({ discordClientId: CLIENT_ID }), []);
    assert.deepStrictEqual(validateConfig({ discordClientId: '12345678901234567890' }), []);
  });
});
