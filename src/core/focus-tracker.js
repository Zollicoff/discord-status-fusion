const DEFAULT_HALF_LIFE_MS = 10 * 60 * 1000;
const MAX_CREDIT_STEP_MS = 60 * 1000;
const ACTIVE_IDLE_SECONDS = 5 * 60;
const LEADER_MARGIN = 1.25;
const MIN_SHARE = 0.1;
const MIN_SCORE_MS = 1;

/**
 * Ranks apps by recent focus time.
 *
 * Every sample credits the elapsed time to the focused app, and all scores
 * decay exponentially with a configurable half-life, so the ranking reflects
 * what the person has mostly been using lately rather than what is merely open.
 * The current leader keeps first place until another app clearly overtakes it,
 * which keeps the status and its elapsed timer from flickering.
 */
class FocusTracker {
  constructor(options = {}) {
    this.halfLifeMs = options.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
    this.maxCreditStepMs = options.maxCreditStepMs ?? MAX_CREDIT_STEP_MS;
    this.activeIdleSeconds = options.activeIdleSeconds ?? ACTIVE_IDLE_SECONDS;
    this.leaderMargin = options.leaderMargin ?? LEADER_MARGIN;
    this.minShare = options.minShare ?? MIN_SHARE;
    this.scores = new Map();
    this.running = [];
    this.focusSupported = false;
    this.lastSampleAt = null;
    this.leader = null;
  }

  /**
   * @param {{running: string[], focused: string|null, focusSupported: boolean, idleSeconds: number|null}} sample
   * @param {number} now - Sample time in milliseconds
   */
  record(sample, now) {
    const elapsed = this.lastSampleAt === null ? 0 : Math.max(0, now - this.lastSampleAt);
    this.lastSampleAt = now;
    this.running = [...sample.running];
    this.focusSupported = Boolean(sample.focusSupported);

    const running = new Set(sample.running);
    const decay = this.halfLifeMs > 0 ? 0.5 ** (elapsed / this.halfLifeMs) : 0;
    for (const [id, score] of this.scores) {
      const decayed = score * decay;
      if (!running.has(id) || decayed < MIN_SCORE_MS) {
        this.scores.delete(id);
      } else {
        this.scores.set(id, decayed);
      }
    }

    const active = sample.idleSeconds === null || sample.idleSeconds === undefined ||
      sample.idleSeconds < this.activeIdleSeconds;
    if (sample.focused && running.has(sample.focused) && active) {
      const credit = Math.max(Math.min(elapsed, this.maxCreditStepMs), MIN_SCORE_MS);
      this.scores.set(sample.focused, (this.scores.get(sample.focused) || 0) + credit);
    }

    if (this.leader && !this.scores.has(this.leader)) {
      this.leader = null;
    }
  }

  /**
   * Apps in display order: most-focused first, or catalog priority when the
   * platform cannot report focus.
   * @param {number} limit
   * @returns {string[]}
   */
  rank(limit) {
    if (!this.focusSupported || this.scores.size === 0) {
      return this.running.slice(0, limit);
    }

    const ranked = [...this.scores.entries()].sort((left, right) => right[1] - left[1]);
    if (this.leader && ranked[0][0] !== this.leader) {
      const leaderScore = this.scores.get(this.leader);
      if (ranked[0][1] < leaderScore * this.leaderMargin) {
        const leaderIndex = ranked.findIndex(([id]) => id === this.leader);
        ranked.unshift(...ranked.splice(leaderIndex, 1));
      }
    }
    this.leader = ranked[0][0];

    const threshold = ranked[0][1] * this.minShare;
    return ranked
      .filter(([, score], index) => index === 0 || score >= threshold)
      .slice(0, limit)
      .map(([id]) => id);
  }

  reset() {
    this.scores.clear();
    this.leader = null;
    this.lastSampleAt = null;
  }
}

module.exports = {
  DEFAULT_HALF_LIFE_MS,
  FocusTracker
};
