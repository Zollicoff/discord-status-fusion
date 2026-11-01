const { describe, it } = require('node:test');
const assert = require('node:assert');

const { FocusTracker } = require('../src/core/focus-tracker');

const MINUTE = 60 * 1000;

function sample(focused, running, idleSeconds = 0) {
  return { focused, focusSupported: true, idleSeconds, running };
}

/**
 * Feed `minutes` of focus on `focused` in 10-second steps.
 */
function use(tracker, clock, focused, running, minutes, idleSeconds = 0) {
  const steps = Math.round((minutes * MINUTE) / 10000);
  for (let step = 0; step < steps; step += 1) {
    clock.now += 10000;
    tracker.record(sample(focused, running, idleSeconds), clock.now);
  }
}

describe('FocusTracker', () => {
  const running = ['chatgpt', 'cursor', 'ghostty', 'chrome'];

  it('falls back to catalog priority when focus is unsupported', () => {
    const tracker = new FocusTracker();
    tracker.record({ focused: null, focusSupported: false, idleSeconds: null, running }, 0);

    assert.deepStrictEqual(tracker.rank(2), ['chatgpt', 'cursor']);
  });

  it('ranks the focused app first from the very first sample', () => {
    const tracker = new FocusTracker();
    tracker.record(sample('ghostty', running), 0);

    assert.deepStrictEqual(tracker.rank(3), ['ghostty']);
  });

  it('orders apps by recent focus time and drops barely used ones', () => {
    const tracker = new FocusTracker();
    const clock = { now: 0 };
    tracker.record(sample('cursor', running), clock.now);

    use(tracker, clock, 'cursor', running, 6);
    use(tracker, clock, 'chrome', running, 2);
    use(tracker, clock, 'ghostty', running, 1);
    use(tracker, clock, 'chatgpt', running, 0.1);

    assert.deepStrictEqual(tracker.rank(3), ['cursor', 'chrome', 'ghostty']);
    assert.deepStrictEqual(tracker.rank(1), ['cursor']);
  });

  it('keeps the leader until a challenger clearly overtakes it', () => {
    const tracker = new FocusTracker({ halfLifeMs: 10 * MINUTE });
    const clock = { now: 0 };
    tracker.record(sample('cursor', running), clock.now);
    use(tracker, clock, 'cursor', running, 5);
    assert.strictEqual(tracker.rank(1)[0], 'cursor');

    // Chrome edges slightly ahead: hysteresis keeps Cursor in front.
    use(tracker, clock, 'chrome', running, 4);
    assert.ok(tracker.scores.get('chrome') > tracker.scores.get('cursor'));
    assert.strictEqual(tracker.rank(1)[0], 'cursor');

    // A sustained switch hands over the lead.
    use(tracker, clock, 'chrome', running, 10);
    assert.strictEqual(tracker.rank(1)[0], 'chrome');
  });

  it('forgets apps that quit', () => {
    const tracker = new FocusTracker();
    const clock = { now: 0 };
    use(tracker, clock, 'cursor', running, 3);
    use(tracker, clock, 'chrome', running, 1);

    clock.now += 10000;
    tracker.record(sample('chrome', ['chrome']), clock.now);

    assert.deepStrictEqual(tracker.rank(3), ['chrome']);
  });

  it('does not credit focus while the user is away', () => {
    const tracker = new FocusTracker({ activeIdleSeconds: 300 });
    const clock = { now: 0 };
    use(tracker, clock, 'cursor', running, 2);
    const before = tracker.scores.get('cursor');

    use(tracker, clock, 'cursor', running, 2, 900);

    assert.ok(tracker.scores.get('cursor') < before);
  });

  it('decays across sleep using real elapsed time but caps credit', () => {
    const tracker = new FocusTracker({ halfLifeMs: 10 * MINUTE, maxCreditStepMs: MINUTE });
    tracker.record(sample('cursor', running), 0);
    tracker.record(sample('cursor', running), 10 * MINUTE);
    const afterTenMinutes = tracker.scores.get('cursor');
    assert.ok(afterTenMinutes <= MINUTE + 1, 'a long gap credits at most one step');

    tracker.record(sample('chrome', running), 10 * MINUTE + 8 * 60 * MINUTE);
    assert.strictEqual(tracker.scores.has('cursor'), false, 'overnight decay clears stale focus');
    assert.deepStrictEqual(tracker.rank(2), ['chrome']);
  });

  it('can be reset', () => {
    const tracker = new FocusTracker();
    tracker.record(sample('cursor', running), 0);
    tracker.reset();
    assert.strictEqual(tracker.scores.size, 0);
    assert.strictEqual(tracker.leader, null);
  });
});
