const { describe, it } = require('node:test');
const assert = require('node:assert');

const { preview } = require('../src/preview');

describe('preview', () => {
  it('describes detection and the resulting presence without Discord', async() => {
    const lines = [];
    const result = await preview({
      dependencies: {
        detector: { sample: async() => ({ running: ['figma', 'safari'], focused: 'figma', focusSupported: true, idleSeconds: 3 }) },
        music: { getCurrentMusic: async() => ({ title: 'Song', artist: 'Band', service: 'Spotify' }) }
      },
      env: { LLM_ENABLED: 'true' },
      output: { log: text => lines.push(text) }
    });

    const text = lines.join('\n');
    assert.match(text, /Running apps:\s+Figma, Safari/);
    assert.match(text, /Focused app:\s+Figma/);
    assert.match(text, /Idle:\s+3s/);
    assert.match(text, /Music:\s+Song — Band \(Spotify\)/);
    assert.match(text, /Figma · ♪ Song — Band/);
    assert.match(text, /Warning: LLM_ENABLED is no longer used/);
    assert.strictEqual(result.activity.state, 'Figma · ♪ Song — Band');
  });

  it('explains when nothing would be shown', async() => {
    const lines = [];
    await preview({
      dependencies: {
        detector: { sample: async() => ({ running: [], focused: null, focusSupported: false, idleSeconds: null }) },
        music: { getCurrentMusic: async() => null }
      },
      env: {},
      output: { log: text => lines.push(text) }
    });

    assert.match(lines[0], /not available on this platform/);
    assert.match(lines[0], /Discord presence would be cleared/);
  });
});
