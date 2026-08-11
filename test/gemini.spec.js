const { describe, it } = require('node:test');
const assert = require('node:assert');

const { GeminiClient } = require('../src/core/gemini');

const context = {
  apps: [
    { id: 'app_1', name: 'ChatGPT' },
    { id: 'app_2', name: 'Ghostty' }
  ],
  music: null
};

function responseWith(text, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async() => ({
      candidates: [{
        finishReason: options.finishReason || 'STOP',
        content: { parts: [{ text }] }
      }]
    })
  };
}

describe('GeminiClient', () => {
  it('requests schema-constrained JSON without putting the key in the URL', async() => {
    let request;
    const client = new GeminiClient({
      apiKeyProvider: { getApiKey: async() => 'secret-key' },
      fetch: async(url, options) => {
        request = { url, options };
        return responseWith(JSON.stringify({
          selectedAppIds: ['app_2'],
          summary: 'Building thoughtfully',
          includeMusic: false
        }));
      },
      model: 'gemini-2.5-flash-lite',
      signalFactory: () => 'test-signal'
    });

    const decision = await client.generateDecision(context);
    const body = JSON.parse(request.options.body);

    assert.deepStrictEqual(decision.selectedAppIds, ['app_2']);
    assert.ok(request.url.includes('gemini-2.5-flash-lite'));
    assert.ok(!request.url.includes('secret-key'));
    assert.strictEqual(request.options.headers['x-goog-api-key'], 'secret-key');
    assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
    assert.deepStrictEqual(
      body.generationConfig.responseSchema.properties.selectedAppIds.items.enum,
      ['app_1', 'app_2']
    );
    assert.ok(body.contents[0].parts[0].text.includes('ChatGPT'));
  });

  it('returns null without making a request when no API key is available', async() => {
    let requested = false;
    const client = new GeminiClient({
      apiKeyProvider: { getApiKey: async() => null },
      fetch: async() => {
        requested = true;
      }
    });

    assert.strictEqual(await client.generateDecision(context), null);
    assert.strictEqual(requested, false);
  });

  it('rejects API errors, incomplete responses, and malformed JSON', async() => {
    const createClient = fetch => new GeminiClient({
      apiKeyProvider: { getApiKey: async() => 'key' },
      fetch,
      signalFactory: () => undefined
    });

    await assert.rejects(
      createClient(async() => ({
        ok: false,
        status: 429,
        json: async() => ({ error: { message: 'Rate limit reached' } })
      })).generateDecision(context),
      /status 429: Rate limit reached/
    );
    await assert.rejects(
      createClient(async() => responseWith('{}', { finishReason: 'MAX_TOKENS' }))
        .generateDecision(context),
      /MAX_TOKENS/
    );
    await assert.rejects(
      createClient(async() => responseWith('not json')).generateDecision(context),
      /invalid JSON/
    );
  });
});
