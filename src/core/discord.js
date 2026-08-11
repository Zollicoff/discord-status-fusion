const DiscordRPC = require('discord-rpc');

const { SILENT_LOGGER } = require('../logger');

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY_MS = 30000;
const OPERATION_TIMEOUT_MS = 1000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class DiscordConnection {
  constructor(options) {
    this.clientId = options.clientId;
    this.clientFactory = options.clientFactory || (() => new DiscordRPC.Client({ transport: 'ipc' }));
    this.logger = options.logger || SILENT_LOGGER;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.sleep = options.sleep || delay;
    this.operationTimeout = options.operationTimeout || OPERATION_TIMEOUT_MS;
    this.client = null;
    this.pendingClient = null;
    this.connectPromise = null;
    this.closing = false;
  }

  connect() {
    if (this.client) {
      return Promise.resolve(this.client);
    }
    if (this.closing) {
      return Promise.reject(new Error('Discord connection is closing'));
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connectWithRetry().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async connectWithRetry() {
    this.logger.info('Connecting to Discord');
    let lastError;

    for (let retry = 0; retry <= this.maxReconnectAttempts; retry += 1) {
      if (this.closing) {
        throw new Error('Discord connection cancelled during shutdown');
      }

      const client = this.clientFactory();
      this.pendingClient = client;

      try {
        await client.login({ clientId: this.clientId });
        if (this.closing) {
          await this.destroyClient(client);
          throw new Error('Discord connection cancelled during shutdown');
        }

        this.pendingClient = null;
        this.client = client;
        client.once('disconnected', () => {
          void this.handleDisconnect(client);
        });
        this.logger.info('Connected to Discord RPC');
        return client;
      } catch (error) {
        lastError = error;
        if (this.pendingClient === client) {
          this.pendingClient = null;
        }
        await this.destroyClient(client);

        if (this.closing || retry === this.maxReconnectAttempts) {
          break;
        }

        const waitMs = Math.min(1000 * (2 ** retry), MAX_RECONNECT_DELAY_MS);
        this.logger.warn(
          `Discord connection failed; retrying in ${waitMs / 1000}s ` +
          `(attempt ${retry + 1}/${this.maxReconnectAttempts})`
        );
        await this.sleep(waitMs);
      }
    }

    throw new Error(`Unable to connect to Discord: ${lastError?.message || 'unknown error'}`);
  }

  async handleDisconnect(client) {
    if (this.closing || this.client !== client) {
      return;
    }

    this.client = null;
    this.logger.warn('Discord disconnected; reconnecting');
    try {
      if (this.connectPromise) {
        await this.connectPromise.catch(() => {});
      }
      if (this.closing || this.client) {
        return;
      }
      await this.connect();
    } catch (error) {
      if (!this.closing) {
        this.logger.error(`Discord reconnection failed: ${error.message}`);
      }
    }
  }

  setActivity(activity) {
    if (!this.client) {
      return Promise.reject(new Error('Discord is not connected'));
    }
    return this.client.setActivity(activity);
  }

  async close() {
    this.closing = true;
    const connectedClient = this.client;
    const pendingClient = this.pendingClient;
    this.client = null;
    this.pendingClient = null;

    if (connectedClient) {
      await this.runOperation(() => connectedClient.clearActivity());
      await this.destroyClient(connectedClient);
    }
    if (pendingClient && pendingClient !== connectedClient) {
      await this.destroyClient(pendingClient);
    }
  }

  destroyClient(client) {
    if (!client || typeof client.destroy !== 'function') {
      return Promise.resolve();
    }
    return this.runOperation(() => client.destroy());
  }

  async runOperation(operation) {
    let timeout;
    try {
      await Promise.race([
        Promise.resolve().then(operation),
        new Promise(resolve => {
          timeout = setTimeout(resolve, this.operationTimeout);
        })
      ]);
    } catch {
      // Closing an already disconnected RPC transport is harmless.
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = DiscordConnection;
