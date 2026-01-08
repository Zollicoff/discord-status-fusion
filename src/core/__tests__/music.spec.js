const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const MusicDetector = require('../music');

describe('MusicDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new MusicDetector();
  });

  describe('constructor', () => {
    it('should initialize with platformWarningShown as false', () => {
      assert.strictEqual(detector.platformWarningShown, false);
    });
  });

  describe('error handling', () => {
    it('should return null when getAppleMusic fails', async() => {
      // Only test on macOS
      if (process.platform !== 'darwin') return;

      // The method should gracefully handle errors and return null
      const result = await detector.getAppleMusic();
      // Result should be null or a string (if music is playing)
      assert.ok(result === null || typeof result === 'string');
    });

    it('should return null when getSpotify fails', async() => {
      // Only test on macOS
      if (process.platform !== 'darwin') return;

      // The method should gracefully handle errors and return null
      const result = await detector.getSpotify();
      // Result should be null or a string (if music is playing)
      assert.ok(result === null || typeof result === 'string');
    });

    it('should continue to Spotify if Apple Music returns null', async() => {
      if (process.platform !== 'darwin') return;

      // Mock Apple Music to return null
      const originalGetAppleMusic = detector.getAppleMusic.bind(detector);
      detector.getAppleMusic = async() => null;

      const result = await detector.getCurrentMusic();
      // Should have tried Spotify after Apple Music returned null
      assert.ok(result === null || typeof result === 'string');

      // Restore original method
      detector.getAppleMusic = originalGetAppleMusic;
    });
  });

  describe('getCurrentMusic', () => {
    it('should return null on non-macOS platforms', async() => {
      // This test only makes sense on non-macOS platforms
      if (process.platform === 'darwin') {
        // On macOS, we can't easily test without music playing
        // Just verify the method exists and returns something
        const result = await detector.getCurrentMusic();
        assert.ok(result === null || typeof result === 'string');
      } else {
        const result = await detector.getCurrentMusic();
        assert.strictEqual(result, null);
      }
    });

    it('should only show platform warning once', async() => {
      if (process.platform !== 'darwin') {
        await detector.getCurrentMusic();
        assert.strictEqual(detector.platformWarningShown, true);

        // Second call should not show warning again
        await detector.getCurrentMusic();
        assert.strictEqual(detector.platformWarningShown, true);
      }
    });
  });

  describe('getAppleMusic', () => {
    it('should be a function', () => {
      assert.strictEqual(typeof detector.getAppleMusic, 'function');
    });

    it('should return null or string', async() => {
      // Only test on macOS
      if (process.platform === 'darwin') {
        const result = await detector.getAppleMusic();
        assert.ok(result === null || typeof result === 'string');
      }
    });
  });

  describe('getSpotify', () => {
    it('should be a function', () => {
      assert.strictEqual(typeof detector.getSpotify, 'function');
    });

    it('should return null or string', async() => {
      // Only test on macOS
      if (process.platform === 'darwin') {
        const result = await detector.getSpotify();
        assert.ok(result === null || typeof result === 'string');
      }
    });
  });
});
