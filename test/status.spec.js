const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const StatusBuilder = require('../src/core/status');

describe('StatusBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new StatusBuilder();
  });

  describe('normalizeApps', () => {
    it('trims and deduplicates app names case-insensitively', () => {
      assert.deepStrictEqual(
        builder.normalizeApps([' ChatGPT ', 'chatgpt', 'Ghostty', '', null]),
        ['ChatGPT', 'Ghostty']
      );
    });

    it('returns an empty list for invalid input', () => {
      assert.deepStrictEqual(builder.normalizeApps(null), []);
    });
  });

  describe('formatStatusDetails', () => {
    it('uses every app when the details fit', () => {
      assert.strictEqual(
        builder.formatStatusDetails(['ChatGPT', 'Ghostty', 'Notion']),
        'Using ChatGPT + Ghostty + Notion'
      );
    });

    it('uses a stable idle label when no apps are detected', () => {
      assert.strictEqual(builder.formatStatusDetails([]), 'Discord Status Fusion');
    });

    it('keeps whole app names and summarizes overflow', () => {
      const compactBuilder = new StatusBuilder({ maxTextLength: 42 });
      const details = compactBuilder.formatStatusDetails([
        'ChatGPT',
        'Ghostty',
        'Notion',
        'Safari',
        'Microsoft Word'
      ]);

      assert.ok(Array.from(details).length <= 42);
      assert.match(details, /\+ \d+ more$/);
      assert.ok(!details.endsWith('...'));
      assert.ok(details.includes('ChatGPT'));
    });
  });

  describe('buildActivity', () => {
    it('builds a rule-based Discord activity payload', () => {
      const activity = builder.buildActivity(['ChatGPT', 'Ghostty'], null, 123);

      assert.strictEqual(activity.details, 'Using ChatGPT + Ghostty');
      assert.strictEqual(activity.state, 'Working on projects');
      assert.strictEqual(activity.smallImageText, 'Active');
      assert.strictEqual(activity.startTimestamp, 123);
      assert.strictEqual(builder.buildActivity([], null, 0).startTimestamp, 0);
    });

    it('uses trimmed music as the state', () => {
      const activity = builder.buildActivity([], '  Song by Artist on Apple Music  ', 123);
      assert.strictEqual(activity.state, 'Song by Artist on Apple Music');
    });

    it('truncates long music at Unicode character boundaries', () => {
      const compactBuilder = new StatusBuilder({ maxTextLength: 8 });
      const activity = compactBuilder.buildActivity([], 'ABC😀DEFGHI', 123);

      assert.strictEqual(Array.from(activity.state).length, 8);
      assert.strictEqual(activity.state, 'ABC😀D...');
    });
  });
});
