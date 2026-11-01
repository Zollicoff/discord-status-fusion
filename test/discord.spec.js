const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

const { DiscordIpcClient } = require('../src/core/discord-ipc');
const { DiscordPresence, stripModernFields } = require('../src/core/discord');
const { createFakeDiscord, socketPath, waitFor } = require('./helpers/fake-discord');

const CLIENT_ID = '123456789012345678';

function collectingLogger() {
  const messages = [];
  const push = level => message => messages.push(`${level}: ${message}`);
  return {
    messages,
    logger: { debug: push('debug'), error: push('error'), info: push('info'), verbose() {}, warn: push('warn') }
  };
}

describe('DiscordPresence', () => {
  let discord;
  let presence;

  afterEach(async() => {
    await presence?.stop();
    await discord?.close();
    presence = null;
    discord = null;
  });

  function createPresence(ipcPath, options = {}) {
    const { logger, messages } = collectingLogger();
    presence = new DiscordPresence({
      clientFactory: () => new DiscordIpcClient({
        clientId: options.clientId || CLIENT_ID,
        paths: [ipcPath],
        requestTimeoutMs: options.requestTimeoutMs ?? 1000
      }),
      clientId: CLIENT_ID,
      logger,
      maxRetryMs: 20,
      minRetryMs: 5,
      shutdownTimeoutMs: 200
    });
    return messages;
  }

  it('waits for Discord to start and then shows the latest activity', async() => {
    const ipcPath = socketPath();
    const messages = createPresence(ipcPath);
    presence.start();

    assert.strictEqual(await presence.setActivity({ details: 'first' }), false);
    assert.strictEqual(await presence.setActivity({ details: 'latest' }), false);
    await new Promise(resolve => setTimeout(resolve, 30));

    discord = createFakeDiscord({ path: ipcPath });
    await discord.listen();

    await waitFor(() => discord.state.activities.length === 1);
    assert.deepStrictEqual(discord.state.activities, [{ details: 'latest' }]);
    assert.ok(messages.some(message => /info: Waiting for Discord \(Discord is not running\)/.test(message)));
    assert.ok(messages.some(message => /Connected to Discord as Tester/.test(message)));
    assert.strictEqual(messages.filter(message => message.startsWith('info: Waiting')).length, 1);
  });

  it('skips identical activities', async() => {
    discord = createFakeDiscord();
    await discord.listen();
    createPresence(discord.path);
    presence.start();
    await waitFor(() => presence.connected);

    assert.strictEqual(await presence.setActivity({ details: 'same' }), true);
    assert.strictEqual(await presence.setActivity({ details: 'same' }), true);
    assert.strictEqual(await presence.setActivity({ details: 'new' }), true);

    assert.deepStrictEqual(discord.state.activities, [{ details: 'same' }, { details: 'new' }]);
  });

  it('reconnects forever and re-sends the activity after Discord restarts', async() => {
    discord = createFakeDiscord();
    await discord.listen();
    const messages = createPresence(discord.path);
    presence.start();
    await waitFor(() => presence.connected);
    await presence.setActivity({ details: 'building' });

    const ipcPath = discord.path;
    await discord.close();
    await waitFor(() => !presence.connected);
    // Well past the old 10-attempt limit.
    await new Promise(resolve => setTimeout(resolve, 300));

    discord = createFakeDiscord({ path: ipcPath });
    await discord.listen();
    await waitFor(() => discord.state.activities.length === 1);

    assert.deepStrictEqual(discord.state.activities, [{ details: 'building' }]);
    assert.ok(messages.some(message => /warn: Discord disconnected/.test(message)));
  });

  it('falls back to the classic payload when newer fields are rejected', async() => {
    discord = createFakeDiscord({ rejectFields: ['type', 'status_display_type'] });
    await discord.listen();
    const messages = createPresence(discord.path);
    presence.start();
    await waitFor(() => presence.connected);

    assert.strictEqual(await presence.setActivity({ details: 'x', type: 2, status_display_type: 2 }), true);
    assert.strictEqual(await presence.setActivity({ details: 'y', type: 0 }), true);

    assert.deepStrictEqual(discord.state.activities, [{ details: 'x' }, { details: 'y' }]);
    assert.ok(messages.some(message => /classic format/.test(message)));
  });

  it('treats an unanswered request as a dead connection', async() => {
    discord = createFakeDiscord({ silent: true });
    await discord.listen();
    const messages = createPresence(discord.path, { requestTimeoutMs: 30 });
    presence.start();
    await waitFor(() => presence.connected);

    assert.strictEqual(await presence.setActivity({ details: 'stuck' }), false);
    assert.ok(messages.some(message => /did not answer SET_ACTIVITY.*reconnecting/.test(message)));
    await waitFor(() => discord.state.handshakes.length >= 2);
  });

  it('logs a rejected client id once and keeps retrying', async() => {
    discord = createFakeDiscord();
    await discord.listen();
    const messages = createPresence(discord.path, { clientId: 'invalid' });
    presence.start();

    await waitFor(() => discord.state.handshakes.length >= 3);
    const errors = messages.filter(message => message.startsWith('error:'));
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /DISCORD_CLIENT_ID.*Invalid Client ID/);
  });

  it('clears the activity and disconnects on stop', async() => {
    discord = createFakeDiscord();
    await discord.listen();
    createPresence(discord.path);
    presence.start();
    await waitFor(() => presence.connected);
    await presence.setActivity({ details: 'bye' });

    await presence.stop();

    assert.deepStrictEqual(discord.state.activities, [{ details: 'bye' }, null]);
    assert.strictEqual(presence.connected, false);
    await waitFor(() => discord.state.sockets.size === 0);
  });

  it('stops retrying promptly while Discord is down', async() => {
    createPresence(socketPath());
    presence.maxRetryMs = 60000;
    presence.minRetryMs = 60000;
    presence.start();
    await new Promise(resolve => setTimeout(resolve, 20));

    const started = Date.now();
    await presence.stop();
    assert.ok(Date.now() - started < 500);
  });
});

describe('stripModernFields', () => {
  it('removes only newer activity fields', () => {
    const activity = { details: 'd', type: 2, status_display_type: 1 };
    assert.deepStrictEqual(stripModernFields(activity), { details: 'd' });
    assert.deepStrictEqual(activity.type, 2, 'does not mutate the input');
    assert.strictEqual(stripModernFields(null), null);
  });
});
