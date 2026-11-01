const { describe, it } = require('node:test');
const assert = require('node:assert');

const { MusicDetector, formatTrack, parseTrack } = require('../src/core/music');

const SEP = '\x1f';

function fakeExec(handler, calls = []) {
  return (command, args, _options, callback) => {
    calls.push({ command, args });
    const result = handler(command, args);
    if (result instanceof Error) {
      callback(result);
    } else {
      callback(null, result);
    }
  };
}

describe('MusicDetector', () => {
  it('returns structured Apple Music tracks without launching players', async() => {
    const calls = [];
    const detector = new MusicDetector({
      platform: 'darwin',
      execFile: fakeExec((_command, args) => args[1].includes('"Music"') ? `Midnight City${SEP}M83\n` : '', calls)
    });

    assert.deepStrictEqual(await detector.getCurrentMusic(), {
      artist: 'M83',
      service: 'Apple Music',
      title: 'Midnight City'
    });
    for (const call of calls) {
      assert.match(call.args[1], /if application "(?:Music|Spotify)" is running then/);
    }
  });

  it('falls back to Spotify and tolerates player errors', async() => {
    const detector = new MusicDetector({
      platform: 'darwin',
      execFile: fakeExec((_command, args) => args[1].includes('"Music"') ?
        new Error('Music quit') :
        `Intro${SEP}The xx`)
    });

    assert.deepStrictEqual(await detector.getCurrentMusic(), {
      artist: 'The xx',
      service: 'Spotify',
      title: 'Intro'
    });
  });

  it('returns null when nothing is playing', async() => {
    const detector = new MusicDetector({ platform: 'darwin', execFile: fakeExec(() => '\n') });
    assert.strictEqual(await detector.getCurrentMusic(), null);
  });

  it('reads known MPRIS players through playerctl on Linux', async() => {
    const detector = new MusicDetector({
      platform: 'linux',
      execFile: fakeExec(() => [
        `firefox${SEP}Playing${SEP}Some Video${SEP}Channel`,
        `spotify${SEP}Paused${SEP}Old Song${SEP}Band`,
        `rhythmbox.instance123${SEP}Playing${SEP}Teardrop${SEP}Massive Attack`
      ].join('\n'))
    });

    assert.deepStrictEqual(await detector.getCurrentMusic(), {
      artist: 'Massive Attack',
      service: 'Rhythmbox',
      title: 'Teardrop'
    });
  });

  it('stops calling playerctl when it is not installed', async() => {
    const calls = [];
    const detector = new MusicDetector({
      platform: 'linux',
      execFile: fakeExec(() => Object.assign(new Error('spawn playerctl ENOENT'), { code: 'ENOENT' }), calls)
    });

    assert.strictEqual(await detector.getCurrentMusic(), null);
    assert.strictEqual(await detector.getCurrentMusic(), null);
    assert.strictEqual(calls.length, 1);
  });

  it('reports no music on unsupported platforms', async() => {
    const detector = new MusicDetector({
      platform: 'win32',
      execFile: () => assert.fail('should not run commands')
    });
    assert.strictEqual(await detector.getCurrentMusic(), null);
  });

  it('parses and formats tracks', () => {
    assert.strictEqual(parseTrack('', 'Spotify'), null);
    assert.deepStrictEqual(parseTrack('Untitled', 'Spotify'), { title: 'Untitled', artist: null, service: 'Spotify' });
    assert.strictEqual(formatTrack({ title: 'Song', artist: 'Band' }), 'Song — Band');
    assert.strictEqual(formatTrack({ title: 'Song', artist: null }), 'Song');
  });
});
