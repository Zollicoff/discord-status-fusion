const { describe, it } = require('node:test');
const assert = require('node:assert');

const { getApp } = require('../src/core/app-catalog');
const { CATEGORY_PHRASES, PAIR_PHRASES, describeActivity } = require('../src/core/activity');

function apps(...ids) {
  return ids.map(id => getApp(id));
}

describe('describeActivity', () => {
  it('returns null without apps', () => {
    assert.strictEqual(describeActivity([]), null);
    assert.strictEqual(describeActivity(undefined), null);
  });

  it('describes a single app by its category', () => {
    assert.ok(CATEGORY_PHRASES.design.includes(describeActivity(apps('figma'))));
    assert.ok(CATEGORY_PHRASES.video.includes(describeActivity(apps('final-cut'))));
    assert.ok(CATEGORY_PHRASES.browser.includes(describeActivity(apps('safari'))));
  });

  it('refines the phrase with the first supporting app that pairs', () => {
    assert.ok(PAIR_PHRASES['code+ai'].includes(describeActivity(apps('cursor', 'chatgpt'))));
    assert.ok(PAIR_PHRASES['ai+terminal'].includes(describeActivity(apps('chatgpt', 'ghostty'))));
    assert.ok(PAIR_PHRASES['code+browser'].includes(describeActivity(apps('zed', 'safari'))));
    // An unpaired supporting app is skipped in favour of the next one.
    assert.ok(PAIR_PHRASES['code+ai'].includes(describeActivity(apps('vscode', 'excel', 'claude'))));
    // No pairing at all falls back to the leading category.
    assert.ok(CATEGORY_PHRASES['3d'].includes(describeActivity(apps('blender', 'excel'))));
  });

  it('is stable across polls for the same apps', () => {
    const first = describeActivity(apps('cursor', 'chatgpt', 'ghostty'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.strictEqual(describeActivity(apps('cursor', 'chatgpt', 'ghostty')), first);
    }
    // Supporting apps are considered in focus order.
    assert.ok(PAIR_PHRASES['code+terminal'].includes(describeActivity(apps('cursor', 'ghostty', 'chatgpt'))));
  });

  it('only uses phrases that fit comfortably in Discord fields', () => {
    const phrases = [...Object.values(CATEGORY_PHRASES), ...Object.values(PAIR_PHRASES)].flat();
    for (const phrase of phrases) {
      assert.ok(phrase.length >= 2 && phrase.length <= 40, phrase);
    }
  });
});
