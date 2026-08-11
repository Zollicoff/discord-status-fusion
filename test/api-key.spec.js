const { describe, it } = require('node:test');
const assert = require('node:assert');

const { GeminiApiKeyProvider } = require('../src/core/api-key');

describe('GeminiApiKeyProvider', () => {
  it('prefers the current environment variable without invoking Keychain', async() => {
    let commandCalls = 0;
    const provider = new GeminiApiKeyProvider({
      env: { GEMINI_API_KEY: '  env-key  ' },
      execFile: () => {
        commandCalls += 1;
      },
      platform: 'darwin'
    });

    assert.strictEqual(await provider.getApiKey(), 'env-key');
    assert.strictEqual(commandCalls, 0);
  });

  it('supports the legacy macOS Keychain service name', async() => {
    const services = [];
    const provider = new GeminiApiKeyProvider({
      env: {},
      execFile: (_command, args, _options, callback) => {
        const service = args[args.indexOf('-s') + 1];
        services.push(service);
        if (service === 'GEMINI_API_KEY') {
          callback(new Error('not found'));
          return;
        }
        callback(null, 'legacy-key\n');
      },
      platform: 'darwin'
    });

    assert.strictEqual(await provider.getApiKey(), 'legacy-key');
    assert.deepStrictEqual(services, ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY']);
  });

  it('caches a missing-key result and warns once', async() => {
    const warnings = [];
    const provider = new GeminiApiKeyProvider({
      env: {},
      logger: { info() {}, warn: message => warnings.push(message) },
      platform: 'linux'
    });

    assert.strictEqual(await provider.getApiKey(), null);
    assert.strictEqual(await provider.getApiKey(), null);
    assert.strictEqual(warnings.length, 1);
  });
});
