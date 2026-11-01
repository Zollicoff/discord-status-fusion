const { getApp } = require('./core/app-catalog');
const { describePresence } = require('./core/presence');
const { SILENT_LOGGER } = require('./logger');
const { SILENT_SPINNER } = require('./ui/spinner');

/**
 * Samples local activity on an interval and keeps Discord in sync.
 *
 * Each tick: detect apps/focus/idle and music -> update focus scores -> rank
 * apps -> build the presence -> hand it to Discord (which skips duplicates).
 */
class StatusFusionApp {
  constructor(options) {
    this.detector = options.detector;
    this.music = options.music;
    this.tracker = options.tracker;
    this.presenceBuilder = options.presenceBuilder;
    this.discord = options.discord;
    this.logger = options.logger || SILENT_LOGGER;
    this.spinner = options.spinner || SILENT_SPINNER;
    this.updateInterval = options.updateInterval;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 0;
    this.maxApps = options.maxApps ?? 3;
    this.showMusic = options.showMusic !== false;
    this.now = options.now || Date.now;
    this.setInterval = options.setInterval || setInterval;
    this.clearInterval = options.clearInterval || clearInterval;
    this.timer = null;
    this.running = false;
    this.stopping = false;
    this.busy = false;
    this.sessionKey = undefined;
    this.sessionStart = null;
    this.lastSummary = null;
    this.wasIdle = false;
  }

  async start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopping = false;
    this.logger.info('Starting Discord Status Fusion');
    this.discord.start();
    await this.tick();
    this.timer = this.setInterval(() => {
      void this.tick();
    }, this.updateInterval);
    this.logger.info(`Sampling activity every ${this.updateInterval / 1000}s`);
  }

  /**
   * Compute the presence for the current moment without touching Discord.
   * @returns {Promise<{activity: object|null, apps: object[], music: object|null, idle: boolean, sample: object}>}
   */
  async compute() {
    const [sample, music] = await Promise.all([
      this.detector.sample(),
      this.showMusic ? this.music.getCurrentMusic() : Promise.resolve(null)
    ]);
    const now = this.now();
    this.tracker.record(sample, now);

    const idle = this.idleTimeoutMs > 0 &&
      Number.isFinite(sample.idleSeconds) &&
      sample.idleSeconds * 1000 >= this.idleTimeoutMs;
    const apps = idle ? [] : this.tracker.rank(this.maxApps).map(getApp).filter(Boolean);

    const sessionKey = apps[0]?.id ?? (music ? `music:${music.title}:${music.artist}` : null);
    if (sessionKey !== this.sessionKey) {
      this.sessionKey = sessionKey;
      this.sessionStart = now;
    }

    const activity = this.presenceBuilder.build({ apps, music, startTimestamp: this.sessionStart });
    return { activity, apps, music, idle, sample };
  }

  async tick() {
    if (this.busy || this.stopping) {
      return false;
    }
    this.busy = true;
    try {
      const { activity, idle, sample } = await this.compute();
      if (this.stopping) {
        return false;
      }

      if (idle !== this.wasIdle) {
        this.wasIdle = idle;
        this.logger.info(idle ?
          `Idle for ${Math.floor(sample.idleSeconds / 60)} min; hiding app activity` :
          'Activity resumed');
      }

      const summary = describePresence(activity);
      if (summary !== this.lastSummary) {
        this.lastSummary = summary;
        this.spinner.stop();
        this.logger.info(`Status: ${summary}`);
      }
      this.logger.verbose(`Sample: ${JSON.stringify(sample)}`);
      if (this.running && !this.stopping) {
        this.spinner.start(summary);
      }

      return await this.discord.setActivity(activity);
    } catch (error) {
      this.spinner.stop();
      this.logger.error(`Status update failed: ${error.message}`);
      return false;
    } finally {
      this.busy = false;
    }
  }

  async stop() {
    if (this.stopping) {
      return;
    }
    this.stopping = true;
    this.running = false;
    if (this.timer) {
      this.clearInterval(this.timer);
      this.timer = null;
    }
    this.spinner.stop();
    await this.discord.stop();
    this.logger.info('Discord Status Fusion stopped');
  }
}

module.exports = {
  StatusFusionApp
};
