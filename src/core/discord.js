const { DiscordIpcClient } = require('./discord-ipc');
const { SILENT_LOGGER } = require('../logger');

const MIN_RETRY_MS = 2000;
const MAX_RETRY_MS = 60000;
const SHUTDOWN_TIMEOUT_MS = 1000;
const MODERN_FIELDS = Object.freeze(['type', 'status_display_type']);

/**
 * Keeps a Discord presence in sync for the lifetime of the daemon.
 *
 * - Connects in the background and retries forever with capped backoff, so the
 *   daemon can start before Discord and survive Discord restarts.
 * - Remembers the desired activity and re-sends it after every reconnect.
 * - Skips identical payloads, and treats an unanswered request as a dead
 *   connection instead of waiting on it forever.
 * - Falls back to the classic payload if a Discord build rejects newer fields.
 */
class DiscordPresence {
  constructor(options) {
    this.clientId = options.clientId;
    this.logger = options.logger || SILENT_LOGGER;
    this.clientFactory = options.clientFactory ||
      (() => new DiscordIpcClient({ clientId: this.clientId }));
    this.minRetryMs = options.minRetryMs ?? MIN_RETRY_MS;
    this.maxRetryMs = options.maxRetryMs ?? MAX_RETRY_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? SHUTDOWN_TIMEOUT_MS;
    this.client = null;
    this.stopped = true;
    this.looping = false;
    this.wake = null;
    this.desired = undefined;
    this.lastSentKey = null;
    this.legacyPayload = false;
    this.queue = Promise.resolve();
    this.failures = 0;
  }

  get connected() {
    return this.client !== null;
  }

  start() {
    this.stopped = false;
    void this.connectLoop();
  }

  async connectLoop() {
    if (this.looping) {
      return;
    }
    this.looping = true;
    try {
      while (!this.stopped && !this.client) {
        const client = this.clientFactory();
        try {
          const user = await client.connect();
          if (this.stopped) {
            client.destroy();
            break;
          }
          this.attach(client, user);
        } catch (error) {
          client.destroy?.();
          this.failures += 1;
          this.logFailure(error);
          await this.sleep(this.retryDelay());
        }
      }
    } finally {
      this.looping = false;
    }
  }

  attach(client, user) {
    this.client = client;
    this.lastSentKey = null;
    this.failures = 0;
    client.once('close', reason => this.onClose(client, reason));
    const name = user?.global_name || user?.username;
    this.logger.info(name ? `Connected to Discord as ${name}` : 'Connected to Discord');
    void this.flush();
  }

  onClose(client, reason) {
    if (this.client !== client) {
      return;
    }
    this.client = null;
    this.lastSentKey = null;
    if (!this.stopped) {
      this.logger.warn(`Discord disconnected (${reason}); reconnecting`);
      void this.connectLoop();
    }
  }

  logFailure(error) {
    const message = error?.message || String(error);
    if (/client.?id/i.test(message)) {
      if (this.failures === 1) {
        this.logger.error(`Discord rejected DISCORD_CLIENT_ID: ${message}`);
      }
      return;
    }
    if (this.failures === 1) {
      this.logger.info(`Waiting for Discord (${message}); retrying in the background`);
    } else {
      this.logger.debug(`Discord connection attempt ${this.failures} failed: ${message}`);
    }
  }

  retryDelay() {
    return Math.min(this.minRetryMs * (2 ** Math.max(0, this.failures - 1)), this.maxRetryMs);
  }

  sleep(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(done, ms);
      const self = this;
      function done() {
        clearTimeout(timer);
        if (self.wake === done) {
          self.wake = null;
        }
        resolve();
      }
      this.wake = done;
    });
  }

  /**
   * Set the desired activity (null clears it). Resolves to true once Discord
   * shows it, or false while disconnected; it is re-sent after reconnecting.
   */
  setActivity(activity) {
    this.desired = activity ?? null;
    return this.flush();
  }

  flush() {
    this.queue = this.queue.then(() => this.send(), () => this.send());
    return this.queue;
  }

  async send() {
    const client = this.client;
    if (!client || this.desired === undefined) {
      return false;
    }

    const payload = this.legacyPayload ? stripModernFields(this.desired) : this.desired;
    const key = JSON.stringify(payload);
    if (key === this.lastSentKey) {
      return true;
    }

    try {
      await client.setActivity(payload);
      if (this.client === client) {
        this.lastSentKey = key;
      }
      return true;
    } catch (error) {
      if (error.name === 'DiscordRpcError' && !this.legacyPayload && hasModernFields(payload)) {
        this.legacyPayload = true;
        this.logger.info(`Discord rejected newer activity fields (${error.message}); using the classic format`);
        return this.send();
      }
      if (error.timeout) {
        this.logger.warn(`${error.message}; reconnecting`);
        client.destroy();
        return false;
      }
      this.logger.warn(`Discord did not accept the activity: ${error.message}`);
      return false;
    }
  }

  async stop() {
    this.stopped = true;
    this.wake?.();
    await this.queue.catch(() => {});
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }
    try {
      await client.setActivity(null, this.shutdownTimeoutMs);
    } catch {
      // Discord clears a presence when its IPC connection closes anyway.
    }
    client.destroy();
  }
}

function hasModernFields(activity) {
  return Boolean(activity) && MODERN_FIELDS.some(field => field in activity);
}

function stripModernFields(activity) {
  if (!hasModernFields(activity)) {
    return activity;
  }
  const copy = { ...activity };
  for (const field of MODERN_FIELDS) {
    delete copy[field];
  }
  return copy;
}

module.exports = {
  DiscordPresence,
  stripModernFields
};
