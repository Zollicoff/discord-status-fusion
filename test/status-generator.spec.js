const { describe, it } = require('node:test');
const assert = require('node:assert');

const StatusBuilder = require('../src/core/status');
const StatusGenerator = require('../src/core/status-generator');

function createGenerator(generateDecision, options = {}) {
  const warnings = [];
  const generator = new StatusGenerator({
    client: { generateDecision },
    enabled: options.enabled,
    fallbackBuilder: new StatusBuilder(),
    logger: {
      info() {},
      warn: message => warnings.push(message)
    }
  });
  return { generator, warnings };
}

describe('StatusGenerator', () => {
  it('lets the LLM choose emphasis while code renders canonical names', async() => {
    const { generator } = createGenerator(async() => ({
      selectedAppIds: ['app_2', 'app_1'],
      summary: 'Building with focused momentum',
      includeMusic: false
    }));

    const activity = await generator.generateActivity(['ChatGPT', 'Ghostty', 'Safari'], null, 123);

    assert.strictEqual(activity.details, 'Using Ghostty + ChatGPT');
    assert.strictEqual(activity.state, 'Building with focused momentum');
    assert.strictEqual(activity.smallImageText, 'AI-Curated');
    assert.strictEqual(activity.startTimestamp, 123);
  });

  it('uses exact detected music when the LLM elects to include it', async() => {
    const { generator } = createGenerator(async() => ({
      selectedAppIds: ['app_1'],
      summary: 'Deep creative focus',
      includeMusic: true
    }));
    const music = 'Actual Track by Actual Artist on Apple Music';

    const activity = await generator.generateActivity(['ChatGPT'], music, 123);
    assert.strictEqual(activity.state, music);
  });

  it('caches a validated decision for unchanged source state', async() => {
    let calls = 0;
    const { generator } = createGenerator(async() => {
      calls += 1;
      return {
        selectedAppIds: ['app_1'],
        summary: 'Exploring useful ideas',
        includeMusic: false
      };
    });

    const first = await generator.generateActivity(['ChatGPT'], null, 100);
    const second = await generator.generateActivity(['ChatGPT'], null, 200);

    assert.strictEqual(calls, 1);
    assert.strictEqual(second.state, first.state);
    assert.strictEqual(second.startTimestamp, 200);
  });

  it('falls back when decisions hallucinate, duplicate, fail, or are unavailable', async() => {
    const invalidDecisions = [
      { selectedAppIds: ['app_99'], summary: 'Using Warp', includeMusic: false },
      { selectedAppIds: ['app_1', 'app_1'], summary: 'Building things', includeMusic: false }
    ];

    for (const decision of invalidDecisions) {
      const { generator, warnings } = createGenerator(async() => decision);
      const activity = await generator.generateActivity(['ChatGPT', 'Ghostty'], null, 123);
      assert.strictEqual(activity.details, 'Using ChatGPT + Ghostty');
      assert.strictEqual(activity.state, 'Working on projects');
      assert.strictEqual(warnings.length, 1);
    }

    const unavailable = createGenerator(async() => null);
    assert.strictEqual(
      (await unavailable.generator.generateActivity(['ChatGPT'], null, 123)).details,
      'Using ChatGPT'
    );

    const failed = createGenerator(async() => {
      throw new Error('offline');
    });
    assert.strictEqual(
      (await failed.generator.generateActivity(['ChatGPT'], null, 123)).details,
      'Using ChatGPT'
    );
  });
});
