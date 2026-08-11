const { EventEmitter } = require('events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const DiscordConnection = require('../src/core/discord');

class FakeClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.loginError = options.loginError;
    this.calls = [];
  }

  async login(options) {
    this.calls.push(['login', options]);
    if (this.loginError) {
      throw this.loginError;
    }
    return this;
  }

  async setActivity(activity) {
    this.calls.push(['setActivity', activity]);
  }

  async clearActivity() {
    this.calls.push(['clearActivity']);
  }

  async destroy() {
    this.calls.push(['destroy']);
  }
}

const silentLogger = {
  error() {},
  info() {},
  warn() {}
};

describe('DiscordConnection', () => {
  it('connects once and forwards activity updates', async() => {
    const client = new FakeClient();
    const connection = new DiscordConnection({
      clientFactory: () => client,
      clientId: '12345678901234567',
      logger: silentLogger
    });

    await connection.connect();
    await connection.connect();
    await connection.setActivity({ details: 'Using ChatGPT' });

    assert.strictEqual(client.calls.filter(([name]) => name === 'login').length, 1);
    assert.deepStrictEqual(client.calls.at(-1), ['setActivity', { details: 'Using ChatGPT' }]);
  });

  it('retries failed connections with bounded backoff', async() => {
    const first = new FakeClient({ loginError: new Error('offline') });
    const second = new FakeClient();
    const clients = [first, second];
    const delays = [];
    const connection = new DiscordConnection({
      clientFactory: () => clients.shift(),
      clientId: '12345678901234567',
      logger: silentLogger,
      sleep: async ms => delays.push(ms)
    });

    await connection.connect();

    assert.deepStrictEqual(delays, [1000]);
    assert.ok(first.calls.some(([name]) => name === 'destroy'));
    assert.strictEqual(connection.client, second);
  });

  it('reconnects after the active client disconnects', async() => {
    const first = new FakeClient();
    const second = new FakeClient();
    const clients = [first, second];
    const connection = new DiscordConnection({
      clientFactory: () => clients.shift(),
      clientId: '12345678901234567',
      logger: silentLogger
    });

    await connection.connect();
    first.emit('disconnected');
    await new Promise(resolve => setImmediate(resolve));

    assert.strictEqual(connection.client, second);
  });

  it('clears activity and destroys the client during shutdown', async() => {
    const client = new FakeClient();
    const connection = new DiscordConnection({
      clientFactory: () => client,
      clientId: '12345678901234567',
      logger: silentLogger
    });

    await connection.connect();
    await connection.close();

    assert.ok(client.calls.some(([name]) => name === 'clearActivity'));
    assert.ok(client.calls.some(([name]) => name === 'destroy'));
    await assert.rejects(connection.setActivity({}), /not connected/);
  });
});
