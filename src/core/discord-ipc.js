const EventEmitter = require('events');
const net = require('net');
const path = require('path');
const { randomUUID } = require('crypto');

/**
 * Minimal Discord RPC client over the local IPC socket.
 *
 * Wire format: 8-byte header (int32 LE opcode, int32 LE length) + UTF-8 JSON.
 * After a HANDSHAKE the client waits for the READY dispatch, then sends FRAME
 * commands correlated by nonce. PING frames must be answered with PONG.
 */

const OPCODES = Object.freeze({ HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 });
const MAX_PIPES = 10;
const CONNECT_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 5000;

function getIpcPaths(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    return Array.from({ length: MAX_PIPES }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`);
  }

  const { join, resolve } = path.posix;
  const base = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp';
  const directories = [
    base,
    join(base, 'app', 'com.discordapp.Discord'),
    join(base, 'app', 'com.discordapp.DiscordCanary'),
    join(base, 'snap.discord'),
    join(base, '.flatpak', 'dev.vencord.Vesktop', 'xdg-run')
  ];
  if (resolve(base) !== '/tmp') {
    directories.push('/tmp');
  }

  const paths = [];
  for (const directory of directories) {
    for (let index = 0; index < MAX_PIPES; index += 1) {
      paths.push(join(directory, `discord-ipc-${index}`));
    }
  }
  return paths;
}

function encodeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(opcode, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

class FrameDecoder {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames = [];
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readInt32LE(0);
      const size = this.buffer.readInt32LE(4);
      if (size < 0 || this.buffer.length < 8 + size) {
        break;
      }
      const body = this.buffer.subarray(8, 8 + size).toString('utf8');
      this.buffer = this.buffer.subarray(8 + size);
      let data;
      try {
        data = body ? JSON.parse(body) : null;
      } catch {
        data = null;
      }
      frames.push({ opcode, data });
    }
    return frames;
  }
}

class DiscordRpcError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DiscordRpcError';
    this.code = code;
  }
}

class DiscordIpcClient extends EventEmitter {
  constructor(options) {
    super();
    this.clientId = options.clientId;
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.pid = options.pid ?? process.pid;
    this.paths = options.paths || getIpcPaths(this.platform, this.env);
    this.createConnection = options.createConnection || net.createConnection;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.socket = null;
    this.decoder = new FrameDecoder();
    this.pending = new Map();
    this.ready = null;
    this.user = null;
    this.closed = false;
  }

  /**
   * Connect, handshake, and wait for READY.
   * @returns {Promise<object|null>} The connected Discord user, if reported
   */
  async connect() {
    this.socket = await this.openSocket();
    this.socket.on('data', chunk => this.onData(chunk));
    this.socket.on('error', () => {});
    this.socket.on('close', () => this.onClose('Discord closed the IPC connection'));

    let timeout;
    const ready = new Promise((resolve, reject) => {
      this.ready = { resolve, reject };
      timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for Discord to accept the connection'));
      }, this.connectTimeoutMs);
    });

    this.write(OPCODES.HANDSHAKE, { v: 1, client_id: this.clientId });
    try {
      this.user = await ready;
      return this.user;
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      clearTimeout(timeout);
      this.ready = null;
    }
  }

  async openSocket() {
    let lastError = null;
    for (const ipcPath of this.paths) {
      try {
        return await new Promise((resolve, reject) => {
          const socket = this.createConnection(ipcPath);
          const onError = error => {
            socket.destroy();
            reject(error);
          };
          socket.once('error', onError);
          socket.once('connect', () => {
            socket.off('error', onError);
            resolve(socket);
          });
        });
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError?.code === 'ENOENT' || lastError?.code === 'ECONNREFUSED' ?
      'Discord is not running' :
      lastError?.message || 'no IPC socket found';
    throw new Error(reason);
  }

  onData(chunk) {
    for (const { opcode, data } of this.decoder.push(chunk)) {
      if (opcode === OPCODES.PING) {
        this.write(OPCODES.PONG, data);
      } else if (opcode === OPCODES.CLOSE) {
        const message = data?.message || 'Discord closed the connection';
        const error = new DiscordRpcError(message, data?.code);
        if (this.ready) {
          this.ready.reject(error);
        }
        this.onClose(message);
      } else if (opcode === OPCODES.FRAME) {
        this.onFrame(data);
      }
    }
  }

  onFrame(message) {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.cmd === 'DISPATCH' && message.evt === 'READY') {
      if (this.ready) {
        this.ready.resolve(message.data?.user || null);
      }
      return;
    }

    const request = message.nonce ? this.pending.get(message.nonce) : null;
    if (!request) {
      if (message.evt) {
        this.emit('event', message);
      }
      return;
    }
    this.pending.delete(message.nonce);
    clearTimeout(request.timeout);
    if (message.evt === 'ERROR') {
      request.reject(new DiscordRpcError(message.data?.message || 'Discord rejected the request', message.data?.code));
    } else {
      request.resolve(message.data);
    }
  }

  request(cmd, args, timeoutMs = this.requestTimeoutMs) {
    if (this.closed || !this.socket) {
      return Promise.reject(new Error('Discord IPC is not connected'));
    }
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(nonce);
        const error = new Error(`Discord did not answer ${cmd} within ${timeoutMs}ms`);
        error.timeout = true;
        reject(error);
      }, timeoutMs);
      this.pending.set(nonce, { resolve, reject, timeout });
      this.write(OPCODES.FRAME, { cmd, args, nonce });
    });
  }

  /**
   * Set or clear (null) this process's activity.
   */
  setActivity(activity, timeoutMs) {
    const args = { pid: this.pid };
    if (activity) {
      args.activity = activity;
    }
    return this.request('SET_ACTIVITY', args, timeoutMs);
  }

  write(opcode, payload) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(encodeFrame(opcode, payload));
    }
  }

  onClose(reason) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const error = new Error(reason);
    if (this.ready) {
      this.ready.reject(error);
    }
    for (const [nonce, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(nonce);
    }
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.emit('close', reason);
  }

  destroy() {
    this.onClose('Connection closed by client');
  }
}

module.exports = {
  DiscordIpcClient,
  DiscordRpcError,
  FrameDecoder,
  OPCODES,
  encodeFrame,
  getIpcPaths
};
