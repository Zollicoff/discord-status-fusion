const { SILENT_LOGGER } = require('./logger');
const { SILENT_SPINNER } = require('./ui/spinner');

function appListsEqual(left, right) {
  return left.length === right.length && left.every((app, index) => app === right[index]);
}

class StatusFusionApp {
  constructor(options) {
    this.detector = options.detector;
    this.music = options.music;
    this.statusBuilder = options.statusBuilder;
    this.discord = options.discord;
    this.logger = options.logger || SILENT_LOGGER;
    this.spinner = options.spinner || SILENT_SPINNER;
    this.updateInterval = options.updateInterval;
    this.forceUpdateInterval = options.forceUpdateInterval;
    this.now = options.now || Date.now;
    this.setInterval = options.setInterval || setInterval;
    this.clearInterval = options.clearInterval || clearInterval;
    this.startTimestamp = this.now();
    this.lastSnapshot = null;
    this.lastUpdateAt = 0;
    this.timer = null;
    this.running = false;
    this.stopping = false;
    this.isUpdating = false;
  }

  async start() {
    if (this.running) {
      return;
    }

    this.logger.info('Starting Discord Status Fusion');
    await this.discord.connect();
    this.running = true;
    this.stopping = false;
    await this.updateStatus({ force: true });
    this.timer = this.setInterval(() => {
      void this.updateStatus();
    }, this.updateInterval);
    this.logger.info(
      `Monitoring apps every ${this.updateInterval / 1000}s; ` +
      `refreshing every ${this.forceUpdateInterval / 60000}min`
    );
  }

  snapshotChanged(apps, music) {
    return this.lastSnapshot === null ||
      !appListsEqual(apps, this.lastSnapshot.apps) ||
      music !== this.lastSnapshot.music;
  }

  async updateStatus(options = {}) {
    if (this.isUpdating || this.stopping) {
      this.logger.verbose('Skipping overlapping status update');
      return false;
    }

    this.isUpdating = true;
    try {
      const [apps, music] = await Promise.all([
        this.detector.getInterestingApps(),
        this.music.getCurrentMusic()
      ]);
      if (this.stopping) {
        return false;
      }

      const now = this.now();
      const changed = this.snapshotChanged(apps, music);
      const refreshDue = options.force || now - this.lastUpdateAt >= this.forceUpdateInterval;
      if (!changed && !refreshDue) {
        this.logger.verbose('App and music snapshot is unchanged');
        return false;
      }

      this.spinner.stop();
      const activity = this.statusBuilder.buildActivity(apps, music, this.startTimestamp);
      await this.discord.setActivity(activity);
      this.lastSnapshot = { apps: [...apps], music };
      this.lastUpdateAt = now;
      this.logger.info(`Discord status: ${activity.details}`);
      this.logger.info(`Status context: ${activity.state}`);
      return true;
    } catch (error) {
      this.logger.error(`Status update failed: ${error.message}`);
      return false;
    } finally {
      this.isUpdating = false;
      if (this.running && !this.stopping) {
        this.spinner.start();
      }
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
    await this.discord.close();
    this.logger.info('Discord Status Fusion stopped');
  }
}

module.exports = {
  StatusFusionApp,
  appListsEqual
};
