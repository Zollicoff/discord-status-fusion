const net = require('net');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const { FrameDecoder, OPCODES, encodeFrame } = require('../../src/core/discord-ipc');

function socketPath() {
  const id = randomUUID().slice(0, 8);
  return process.platform === 'win32' ?
    `\\\\?\\pipe\\dsf-test-${id}` :
    path.join(os.tmpdir(), `dsf-test-${id}.sock`);
}

/**
 * Minimal stand-in for the Discord client's IPC server.
 *
 * behavior.rejectFields: reply ERROR to activities carrying these fields
 * behavior.silent: never answer commands
 * behavior.invalidClientId: client id that receives a CLOSE during handshake
 */
function createFakeDiscord(behavior = {}) {
  const ipcPath = behavior.path || socketPath();
  const state = {
    activities: [],
    commands: [],
    handshakes: [],
    pongs: [],
    sockets: new Set()
  };

  const server = net.createServer(socket => {
    state.sockets.add(socket);
    socket.on('close', () => state.sockets.delete(socket));
    socket.on('error', () => {});
    const decoder = new FrameDecoder();
    socket.on('data', chunk => {
      for (const { opcode, data } of decoder.push(chunk)) {
        if (opcode === OPCODES.HANDSHAKE) {
          state.handshakes.push(data);
          if (data.client_id === (behavior.invalidClientId || 'invalid')) {
            socket.write(encodeFrame(OPCODES.CLOSE, { code: 4000, message: 'Invalid Client ID' }));
            socket.end();
            continue;
          }
          socket.write(encodeFrame(OPCODES.FRAME, {
            cmd: 'DISPATCH',
            evt: 'READY',
            data: { v: 1, user: { username: 'tester', global_name: 'Tester' } }
          }));
        } else if (opcode === OPCODES.PONG) {
          state.pongs.push(data);
        } else if (opcode === OPCODES.FRAME) {
          state.commands.push(data);
          if (behavior.silent) {
            continue;
          }
          const activity = data.args?.activity;
          const rejected = activity && (behavior.rejectFields || []).some(field => field in activity);
          if (rejected) {
            socket.write(encodeFrame(OPCODES.FRAME, {
              cmd: data.cmd,
              nonce: data.nonce,
              evt: 'ERROR',
              data: { code: 4000, message: 'child "activity" fails because unknown field' }
            }));
            continue;
          }
          state.activities.push(activity ?? null);
          socket.write(encodeFrame(OPCODES.FRAME, { cmd: data.cmd, nonce: data.nonce, evt: null, data: activity ?? null }));
        }
      }
    });
  });

  return {
    path: ipcPath,
    state,
    listen() {
      return new Promise(resolve => server.listen(ipcPath, resolve));
    },
    ping(payload) {
      for (const socket of state.sockets) {
        socket.write(encodeFrame(OPCODES.PING, payload));
      }
    },
    dropConnections() {
      for (const socket of state.sockets) {
        socket.destroy();
      }
    },
    close() {
      for (const socket of state.sockets) {
        socket.destroy();
      }
      return new Promise(resolve => server.close(() => resolve()));
    }
  };
}

async function waitFor(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for condition');
}

module.exports = {
  createFakeDiscord,
  socketPath,
  waitFor
};
