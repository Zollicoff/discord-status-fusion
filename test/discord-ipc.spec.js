const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

const {
  DiscordIpcClient,
  DiscordRpcError,
  FrameDecoder,
  OPCODES,
  encodeFrame,
  getIpcPaths
} = require('../src/core/discord-ipc');
const { createFakeDiscord, socketPath, waitFor } = require('./helpers/fake-discord');

const CLIENT_ID = '123456789012345678';

describe('DiscordIpcClient', () => {
  let discord;
  let client;

  afterEach(async() => {
    client?.destroy();
    await discord?.close();
    client = null;
    discord = null;
  });

  async function connect(behavior = {}, clientOptions = {}) {
    discord = createFakeDiscord(behavior);
    await discord.listen();
    client = new DiscordIpcClient({ clientId: CLIENT_ID, paths: [discord.path], pid: 4242, ...clientOptions });
    return client.connect();
  }

  it('handshakes, waits for READY, and sets activities', async() => {
    const user = await connect();

    assert.strictEqual(user.username, 'tester');
    assert.deepStrictEqual(discord.state.handshakes, [{ v: 1, client_id: CLIENT_ID }]);

    await client.setActivity({ details: 'Writing code' });
    await client.setActivity(null);

    assert.deepStrictEqual(discord.state.activities, [{ details: 'Writing code' }, null]);
    assert.deepStrictEqual(discord.state.commands[0].args, { pid: 4242, activity: { details: 'Writing code' } });
    assert.deepStrictEqual(discord.state.commands[1].args, { pid: 4242 });
    assert.strictEqual(discord.state.commands[0].cmd, 'SET_ACTIVITY');
    assert.notStrictEqual(discord.state.commands[0].nonce, discord.state.commands[1].nonce);
  });

  it('skips missing sockets and tries the next pipe', async() => {
    discord = createFakeDiscord();
    await discord.listen();
    client = new DiscordIpcClient({ clientId: CLIENT_ID, paths: [socketPath(), discord.path] });

    assert.strictEqual((await client.connect()).username, 'tester');
  });

  it('reports when Discord is not running', async() => {
    client = new DiscordIpcClient({ clientId: CLIENT_ID, paths: [socketPath(), socketPath()] });
    await assert.rejects(client.connect(), /Discord is not running/);
  });

  it('rejects an invalid client id with Discord\'s reason', async() => {
    await assert.rejects(connect({}, { clientId: 'invalid' }), /Invalid Client ID/);
  });

  it('surfaces Discord errors as DiscordRpcError', async() => {
    await connect({ rejectFields: ['type'] });
    await assert.rejects(client.setActivity({ type: 2 }), error => {
      assert.ok(error instanceof DiscordRpcError);
      assert.match(error.message, /unknown field/);
      return true;
    });
  });

  it('times out unanswered requests', async() => {
    await connect({ silent: true }, { requestTimeoutMs: 30 });
    await assert.rejects(client.setActivity({ details: 'hi' }), error => error.timeout === true);
  });

  it('answers PING with PONG', async() => {
    await connect();
    discord.ping({ nonce: 'abc' });
    await waitFor(() => discord.state.pongs.length === 1);
    assert.deepStrictEqual(discord.state.pongs, [{ nonce: 'abc' }]);
  });

  it('emits close and rejects pending requests when Discord goes away', async() => {
    await connect({ silent: true });
    const closed = new Promise(resolve => client.once('close', resolve));
    const pending = client.setActivity({ details: 'hi' });

    await waitFor(() => discord.state.commands.length === 1);
    discord.dropConnections();

    await assert.rejects(pending, /closed/);
    assert.match(await closed, /closed/);
    await assert.rejects(client.setActivity({ details: 'again' }), /not connected/);
  });
});

describe('IPC framing', () => {
  it('decodes frames split across and packed into chunks', () => {
    const decoder = new FrameDecoder();
    const first = encodeFrame(OPCODES.FRAME, { a: 1 });
    const second = encodeFrame(OPCODES.PING, { b: '✓' });
    const joined = Buffer.concat([first, second]);

    assert.deepStrictEqual(decoder.push(joined.subarray(0, 5)), []);
    assert.deepStrictEqual(decoder.push(joined.subarray(5, first.length + 3)), [
      { opcode: OPCODES.FRAME, data: { a: 1 } }
    ]);
    assert.deepStrictEqual(decoder.push(joined.subarray(first.length + 3)), [
      { opcode: OPCODES.PING, data: { b: '✓' } }
    ]);
  });

  it('lists IPC paths per platform', () => {
    const windows = getIpcPaths('win32', {});
    assert.strictEqual(windows[0], '\\\\?\\pipe\\discord-ipc-0');
    assert.strictEqual(windows.length, 10);

    const linux = getIpcPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' });
    assert.strictEqual(linux[0], '/run/user/1000/discord-ipc-0');
    assert.ok(linux.includes('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0'));
    assert.ok(linux.includes('/run/user/1000/snap.discord/discord-ipc-0'));
    assert.ok(linux.includes('/tmp/discord-ipc-9'));

    const mac = getIpcPaths('darwin', { TMPDIR: '/var/folders/xy/T/' });
    assert.strictEqual(mac[0], '/var/folders/xy/T/discord-ipc-0');
  });
});
