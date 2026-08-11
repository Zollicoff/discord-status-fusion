const { describe, it } = require('node:test');
const assert = require('node:assert');

const MusicDetector = require('../src/core/music');

function createExecFile(handler) {
  return (command, args, options, callback) => {
    handler({ command, args, options, callback });
  };
}

describe('MusicDetector', () => {
  it('returns null and records its warning on unsupported platforms', async() => {
    const detector = new MusicDetector({ platform: 'linux' });

    assert.strictEqual(await detector.getCurrentMusic(), null);
    assert.strictEqual(detector.platformWarningShown, true);
    assert.strictEqual(await detector.getCurrentMusic(), null);
  });

  it('prefers Apple Music when both supported players report tracks', async() => {
    const execFile = createExecFile(({ args, callback }) => {
      const script = args[1];
      const output = script.includes('application "Music"') ?
        'Apple Song by Artist on Apple Music\n' :
        'Spotify Song by Artist on Spotify\n';
      callback(null, output);
    });
    const detector = new MusicDetector({ platform: 'darwin', execFile });

    assert.strictEqual(
      await detector.getCurrentMusic(),
      'Apple Song by Artist on Apple Music'
    );
  });

  it('falls through to Spotify when Apple Music is not playing', async() => {
    const execFile = createExecFile(({ args, callback }) => {
      const script = args[1];
      callback(null, script.includes('application "Music"') ? '' : 'Song by Artist on Spotify\n');
    });
    const detector = new MusicDetector({ platform: 'darwin', execFile });

    assert.strictEqual(await detector.getCurrentMusic(), 'Song by Artist on Spotify');
  });

  it('guards each query so inactive players are not launched', async() => {
    const scripts = [];
    const execFile = createExecFile(({ args, options, callback }) => {
      scripts.push(args[1]);
      assert.ok(options.timeout > 0);
      callback(null, '');
    });
    const detector = new MusicDetector({ platform: 'darwin', execFile });

    await detector.getCurrentMusic();

    assert.ok(scripts.some(script => script.includes('if application "Music" is running then')));
    assert.ok(scripts.some(script => script.includes('if application "Spotify" is running then')));
  });

  it('returns null when AppleScript fails or times out', async() => {
    const execFile = createExecFile(({ callback }) => {
      callback(new Error('timed out'));
    });
    const detector = new MusicDetector({ platform: 'darwin', execFile });

    assert.strictEqual(await detector.getCurrentMusic(), null);
  });
});
