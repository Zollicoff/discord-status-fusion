const { describe, it } = require('node:test');
const assert = require('node:assert');

const { StatusFusionApp, appListsEqual } = require('../src/app');

const silentLogger = {
  error() {},
  info() {},
  verbose() {},
  warn() {}
};

function createHarness(options = {}) {
  let apps = options.apps || ['ChatGPT', 'Ghostty'];
  let music = options.music ?? null;
  let now = options.now || 1000;
  let timerCallback;
  const activities = [];
  const calls = [];
  const discord = {
    close: async() => calls.push('close'),
    connect: async() => calls.push('connect'),
    setActivity: async activity => {
      if (options.setActivityError) {
        throw options.setActivityError;
      }
      activities.push(activity);
    }
  };
  const spinner = {
    start: () => calls.push('spinner:start'),
    stop: () => calls.push('spinner:stop')
  };
  const app = new StatusFusionApp({
    activityGenerator: {
      generateActivity: async(detectedApps, detectedMusic, startTimestamp) => ({
        details: `Using ${detectedApps.join(' + ')}`,
        startTimestamp,
        state: detectedMusic || 'Working on projects'
      })
    },
    clearInterval: timer => calls.push(`clear:${timer}`),
    detector: { getInterestingApps: async() => [...apps] },
    discord,
    forceUpdateInterval: 5000,
    logger: silentLogger,
    music: { getCurrentMusic: async() => music },
    now: () => now,
    setInterval: callback => {
      timerCallback = callback;
      return 42;
    },
    spinner,
    updateInterval: 10000
  });

  return {
    activities,
    app,
    calls,
    getTimerCallback: () => timerCallback,
    setApps: value => {
      apps = value;
    },
    setMusic: value => {
      music = value;
    },
    setNow: value => {
      now = value;
    }
  };
}

describe('StatusFusionApp', () => {
  it('compares app snapshots without mutating their order', () => {
    const apps = ['ChatGPT', 'Ghostty'];
    assert.strictEqual(appListsEqual(apps, ['ChatGPT', 'Ghostty']), true);
    assert.strictEqual(appListsEqual(apps, ['Ghostty', 'ChatGPT']), false);
    assert.deepStrictEqual(apps, ['ChatGPT', 'Ghostty']);
  });

  it('connects, publishes an initial status, schedules updates, and closes', async() => {
    const harness = createHarness();

    await harness.app.start();

    assert.strictEqual(harness.activities.length, 1);
    assert.strictEqual(typeof harness.getTimerCallback(), 'function');
    assert.strictEqual(harness.activities[0].details, 'Using ChatGPT + Ghostty');
    assert.ok(harness.calls.includes('connect'));

    await harness.app.stop();
    assert.ok(harness.calls.includes('clear:42'));
    assert.ok(harness.calls.includes('close'));
  });

  it('skips unchanged snapshots until the refresh interval elapses', async() => {
    const harness = createHarness();

    assert.strictEqual(await harness.app.updateStatus({ force: true }), true);
    assert.strictEqual(await harness.app.updateStatus(), false);
    harness.setNow(6000);
    assert.strictEqual(await harness.app.updateStatus(), true);
    assert.strictEqual(harness.activities.length, 2);
  });

  it('publishes immediately when apps or music change', async() => {
    const harness = createHarness();

    await harness.app.updateStatus({ force: true });
    harness.setApps(['ChatGPT', 'Notion']);
    harness.setMusic('Song by Artist on Apple Music');

    assert.strictEqual(await harness.app.updateStatus(), true);
    assert.strictEqual(harness.activities[1].state, 'Song by Artist on Apple Music');
  });

  it('does not cache a snapshot when Discord rejects the update', async() => {
    const harness = createHarness({ setActivityError: new Error('offline') });

    assert.strictEqual(await harness.app.updateStatus({ force: true }), false);
    assert.strictEqual(harness.app.lastSnapshot, null);
    assert.strictEqual(harness.app.lastUpdateAt, 0);
  });
});
