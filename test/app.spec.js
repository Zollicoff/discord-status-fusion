const { describe, it } = require('node:test');
const assert = require('node:assert');

const { StatusFusionApp } = require('../src/app');
const { FocusTracker } = require('../src/core/focus-tracker');
const { PresenceBuilder } = require('../src/core/presence');

function createHarness(options = {}) {
  const clock = { now: 1000 };
  const state = {
    sample: options.sample || { running: ['cursor', 'chatgpt'], focused: 'cursor', focusSupported: true, idleSeconds: 0 },
    music: options.music || null
  };
  const sent = [];
  const messages = [];
  const discord = {
    started: false,
    stopped: false,
    start() {
      this.started = true;
    },
    async setActivity(activity) {
      if (options.discordError) {
        throw new Error(options.discordError);
      }
      sent.push(activity);
      return true;
    },
    async stop() {
      this.stopped = true;
    }
  };
  const intervals = [];
  const app = new StatusFusionApp({
    detector: {
      sample: async() => {
        if (options.detectorError) {
          throw new Error(options.detectorError);
        }
        return state.sample;
      }
    },
    discord,
    idleTimeoutMs: options.idleTimeoutMs ?? 600000,
    logger: {
      error: message => messages.push(`error: ${message}`),
      info: message => messages.push(`info: ${message}`),
      verbose() {},
      warn: message => messages.push(`warn: ${message}`)
    },
    maxApps: 3,
    music: { getCurrentMusic: async() => state.music },
    now: () => clock.now,
    presenceBuilder: new PresenceBuilder({ statusDisplay: 'name' }),
    setInterval: (callback, ms) => {
      intervals.push({ callback, ms });
      return intervals.length;
    },
    clearInterval: id => {
      intervals[id - 1].cleared = true;
    },
    showMusic: options.showMusic,
    tracker: new FocusTracker(),
    updateInterval: 10000
  });
  return { app, clock, discord, intervals, messages, sent, state };
}

describe('StatusFusionApp', () => {
  it('starts Discord in the background, publishes immediately, and schedules polling', async() => {
    const { app, discord, intervals, sent } = createHarness();

    await app.start();

    assert.strictEqual(discord.started, true);
    assert.strictEqual(intervals[0].ms, 10000);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].state, 'Cursor');
    assert.strictEqual(sent[0].timestamps.start, 1000);
  });

  it('keeps the elapsed timer while the leading app stays the same', async() => {
    const { app, clock, sent, state } = createHarness();
    for (let tick = 0; tick < 6; tick += 1) {
      await app.tick();
      clock.now += 10000;
    }

    state.sample = { ...state.sample, focused: 'chatgpt' };
    await app.tick();

    const latest = sent.at(-1);
    assert.strictEqual(latest.timestamps.start, 1000);
    assert.strictEqual(latest.state, 'Cursor + ChatGPT');
  });

  it('restarts the elapsed timer when a different app takes the lead', async() => {
    const { app, clock, sent, state } = createHarness();
    await app.tick();

    clock.now += 10000;
    state.sample = { running: ['chatgpt'], focused: 'chatgpt', focusSupported: true, idleSeconds: 0 };
    await app.tick();

    assert.strictEqual(sent[1].state, 'ChatGPT');
    assert.strictEqual(sent[1].timestamps.start, 11000);
  });

  it('hides apps after the idle timeout but keeps showing music', async() => {
    const music = { title: 'Song', artist: 'Band', service: 'Spotify' };
    const { app, messages, sent, state } = createHarness({ idleTimeoutMs: 60000, music });
    state.sample = { ...state.sample, idleSeconds: 120 };

    await app.tick();

    assert.strictEqual(sent[0].type, 2);
    assert.strictEqual(sent[0].details, 'Song');
    assert.ok(messages.some(message => /Idle for 2 min/.test(message)));

    state.music = null;
    await app.tick();
    assert.strictEqual(sent[1], null);
  });

  it('can ignore music entirely', async() => {
    const { app, sent } = createHarness({
      music: { title: 'Song', artist: 'Band', service: 'Spotify' },
      showMusic: false
    });
    await app.tick();
    assert.strictEqual(sent[0].state, 'Cursor');
  });

  it('logs status changes once', async() => {
    const { app, messages } = createHarness();
    await app.tick();
    await app.tick();
    assert.strictEqual(messages.filter(message => message.startsWith('info: Status:')).length, 1);
  });

  it('survives detector failures and skips overlapping ticks', async() => {
    const failing = createHarness({ detectorError: 'ps exploded' });
    assert.strictEqual(await failing.app.tick(), false);
    assert.ok(failing.messages.some(message => /Status update failed: ps exploded/.test(message)));

    const { app } = createHarness();
    app.busy = true;
    assert.strictEqual(await app.tick(), false);
  });

  it('stops polling and Discord on stop', async() => {
    const { app, discord, intervals } = createHarness();
    await app.start();
    await app.stop();
    await app.stop();

    assert.strictEqual(intervals[0].cleared, true);
    assert.strictEqual(discord.stopped, true);
    assert.strictEqual(await app.tick(), false);
  });
});
