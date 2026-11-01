const { describe, it } = require('node:test');
const assert = require('node:assert');

const { getApp } = require('../src/core/app-catalog');
const {
  DEFAULT_LARGE_IMAGE,
  PresenceBuilder,
  describePresence,
  fitText,
  formatAppList,
  truncate
} = require('../src/core/presence');

function apps(...ids) {
  return ids.map(id => getApp(id));
}

const MUSIC = { title: 'Midnight City', artist: 'M83', service: 'Spotify' };

describe('PresenceBuilder', () => {
  it('builds an app activity with a phrase, focus-ordered names, and the product icon', () => {
    const activity = new PresenceBuilder().build({ apps: apps('cursor', 'chatgpt'), startTimestamp: 1000 });

    assert.deepStrictEqual(activity, {
      assets: { large_image: DEFAULT_LARGE_IMAGE, large_text: 'Cursor' },
      details: activity.details,
      instance: false,
      state: 'Cursor + ChatGPT',
      status_display_type: 2,
      timestamps: { start: 1000 },
      type: 0
    });
    assert.match(activity.details, /AI/);
  });

  it('appends the current track to the app line', () => {
    const activity = new PresenceBuilder().build({ apps: apps('figma'), music: MUSIC, startTimestamp: 1 });
    assert.strictEqual(activity.state, 'Figma · ♪ Midnight City — M83');
  });

  it('shows a listening activity when only music is playing', () => {
    const activity = new PresenceBuilder({ statusDisplay: 'name' }).build({ music: MUSIC, startTimestamp: 5 });

    assert.deepStrictEqual(activity, {
      assets: { large_image: DEFAULT_LARGE_IMAGE, large_text: 'Listening on Spotify' },
      details: 'Midnight City',
      instance: false,
      state: 'by M83',
      timestamps: { start: 5 },
      type: 2
    });
  });

  it('clears the presence when there is nothing to show', () => {
    assert.strictEqual(new PresenceBuilder().build({ apps: [], music: null, startTimestamp: 1 }), null);
  });

  it('uses per-app icons from a URL template when configured', () => {
    const activity = new PresenceBuilder({
      appIconUrl: 'https://icons.example/{id}.png',
      largeImage: 'brand',
      statusDisplay: 'state'
    }).build({ apps: apps('vscode'), startTimestamp: 1 });

    assert.deepStrictEqual(activity.assets, {
      large_image: 'https://icons.example/vscode.png',
      large_text: 'VS Code',
      small_image: 'brand',
      small_text: 'Discord Status Fusion'
    });
    assert.strictEqual(activity.status_display_type, 1);
  });

  it('keeps every text field within Discord limits', () => {
    const longMusic = { title: 'x'.repeat(300), artist: 'y'.repeat(300), service: 'Spotify' };
    const activity = new PresenceBuilder().build({
      apps: apps('cursor', 'vscode', 'xcode', 'intellij', 'pycharm', 'android-studio'),
      music: longMusic,
      startTimestamp: 1
    });
    for (const field of [activity.details, activity.state, activity.assets.large_text]) {
      assert.ok(Array.from(field).length <= 128);
      assert.ok(Array.from(field).length >= 2);
    }
    const musicOnly = new PresenceBuilder().build({ music: longMusic, startTimestamp: 1 });
    assert.strictEqual(Array.from(musicOnly.details).length, 128);
  });
});

describe('presence text helpers', () => {
  it('fits complete app names and summarizes the rest', () => {
    assert.strictEqual(formatAppList([]), '');
    assert.strictEqual(formatAppList(['A', 'B']), 'A + B');
    assert.strictEqual(formatAppList(['Alpha', 'Beta', 'Gamma'], 16), 'Alpha + 2 more');
    assert.strictEqual(formatAppList(['Extraordinarily long'], 10), 'Extraordi…');
  });

  it('truncates by Unicode characters and pads short fields', () => {
    assert.strictEqual(truncate('🎵🎵🎵', 2), '🎵…');
    assert.strictEqual(truncate('short', 10), 'short');
    assert.strictEqual(fitText('  spaced   out  '), 'spaced out');
    assert.strictEqual(fitText('X'), 'X​');
    assert.strictEqual(fitText(''), undefined);
    assert.strictEqual(fitText(null), undefined);
  });

  it('summarizes payloads for logs', () => {
    assert.strictEqual(describePresence(null), 'Presence cleared');
    assert.strictEqual(describePresence({ details: 'Designing', state: 'Figma' }), 'Designing — Figma');
  });
});
