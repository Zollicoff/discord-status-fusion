const { describe, it } = require('node:test');
const assert = require('node:assert');

const StatusBuilder = require('../src/core/status');
const {
  buildDecisionPrompt,
  buildDecisionSchema,
  createDecisionContext,
  matchesWholeName,
  validateDecision
} = require('../src/core/status-decision');

const builder = new StatusBuilder();

describe('status decisions', () => {
  it('creates stable IDs from normalized source data', () => {
    const context = createDecisionContext(
      [' ChatGPT ', 'chatgpt', 'Ghostty'],
      ' Song by Artist ',
      builder
    );

    assert.deepStrictEqual(context, {
      apps: [
        { id: 'app_1', name: 'ChatGPT' },
        { id: 'app_2', name: 'Ghostty' }
      ],
      music: 'Song by Artist'
    });
    assert.deepStrictEqual(
      buildDecisionSchema(context).properties.selectedAppIds.items.enum,
      ['app_1', 'app_2']
    );
    assert.ok(buildDecisionPrompt(context).includes('Application IDs and names are authoritative'));
  });

  it('maps a valid ordered selection and preserves exact music text', () => {
    const context = createDecisionContext(
      ['ChatGPT', 'Ghostty', 'Notion'],
      'Track by Artist on Apple Music',
      builder
    );
    const decision = validateDecision({
      selectedAppIds: ['app_2', 'app_1'],
      summary: 'Building and researching',
      includeMusic: true
    }, context);

    assert.deepStrictEqual(decision.selectedApps, ['Ghostty', 'ChatGPT']);
    assert.strictEqual(decision.state, 'Track by Artist on Apple Music');
    assert.strictEqual(decision.usesMusic, true);
  });

  it('rejects unknown and duplicate application IDs', () => {
    const context = createDecisionContext(['ChatGPT', 'Ghostty'], null, builder);
    const base = { summary: 'Building thoughtfully', includeMusic: false };

    assert.throws(
      () => validateDecision({ ...base, selectedAppIds: ['app_3'] }, context),
      /unknown application ID/
    );
    assert.throws(
      () => validateDecision({ ...base, selectedAppIds: ['app_1', 'app_1'] }, context),
      /duplicated application ID/
    );
    assert.throws(
      () => validateDecision({ ...base, selectedAppIds: ['app_1'], extra: true }, context),
      /unexpected fields/
    );
  });

  it('rejects invented catalog names, URLs, multiline text, and phantom music', () => {
    const context = createDecisionContext(['ChatGPT'], null, builder);
    const build = summary => ({
      selectedAppIds: ['app_1'],
      summary,
      includeMusic: false
    });

    assert.throws(
      () => validateDecision(build('Writing in Microsoft Word'), context),
      /named an application/
    );
    assert.throws(() => validateDecision(build('Working in ChatGPT'), context), /named an application/);
    assert.throws(() => validateDecision(build('Visit https://example.com'), context), /URL/);
    assert.throws(() => validateDecision(build('Building\nthings'), context), /single line/);
    assert.throws(
      () => validateDecision({ ...build('Building things'), includeMusic: true }, context),
      /none was detected/
    );
  });

  it('matches catalog names as whole names rather than ordinary substrings', () => {
    assert.strictEqual(matchesWholeName('Searching and researching', 'Arc'), false);
    assert.strictEqual(matchesWholeName('Working in Arc', 'Arc'), true);
  });
});
