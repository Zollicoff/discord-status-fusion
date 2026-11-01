/**
 * Platform smoke test for CI: runs real detection on the host OS once.
 * Not part of `npm test` because results depend on the machine.
 */
const { execFileSync } = require('child_process');
const assert = require('node:assert');

const { MAC_PLAYERS, buildMacPlayerScript } = require('../src/core/music');
const { preview } = require('../src/preview');

(async() => {
  const { sample } = await preview();
  console.log(`\nRaw sample: ${JSON.stringify(sample)}`);

  if (process.platform === 'darwin') {
    assert.strictEqual(sample.focusSupported, true, 'NSWorkspace detection should succeed on macOS');
    assert.ok(Number.isFinite(sample.idleSeconds), 'ioreg idle time should be readable on macOS');
    const music = MAC_PLAYERS.find(player => player.appName === 'Music');
    const output = execFileSync('osascript', ['-e', buildMacPlayerScript(music.appName)], { encoding: 'utf8' });
    assert.strictEqual(output.trim(), '', 'Music query compiles and does not launch Music');
  }

  if (process.platform === 'win32') {
    assert.strictEqual(sample.focusSupported, true, 'Win32 focus APIs should load through Add-Type');
  }

  console.log('Smoke test passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
