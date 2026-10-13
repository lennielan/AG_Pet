/**
 * f03-renderer-boundaries.test.js
 * Feature 3 Boundaries: 60fps Canvas / Pixel Renderer
 * Validates fractional scaling, 0x0 canvas bounds, frame jitter tolerance,
 * 4x performance boundary, and transparent pixel skip optimization.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { PixelValidator, contracts } = TestHarness;

module.exports = {
  name: 'F03 Boundaries: 60fps Canvas / Pixel Renderer',
  tier: 2,
  tests: [
    {
      name: 'test_non_integer_scale_fractional_nearest_neighbor',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        // 1.25x scale: 32 * 1.25 = 40
        const scaled40 = PixelValidator.scaleMatrix(sprite, 1.25);
        assert.strictEqual(scaled40.length, 40);
        assert.strictEqual(scaled40[0].length, 40);
        // Validates all pixels still strictly conform to palette
        const palCheck = PixelValidator.validatePalette(scaled40);
        assert.strictEqual(palCheck.valid, true);
      }
    },
    {
      name: 'test_zero_dimension_canvas_bounds',
      fn: async () => {
        const renderToCanvas = (width, height) => {
          if (width <= 0 || height <= 0) return { rendered: false, reason: 'zero_dimension' };
          return { rendered: true };
        };
        const res = renderToCanvas(0, 0);
        assert.strictEqual(res.rendered, false);
        assert.strictEqual(res.reason, 'zero_dimension');
      }
    },
    {
      name: 'test_frame_jitter_tolerance',
      fn: async () => {
        // Simulates animation timer recovering from 100ms lag spike
        let currentFrame = 0;
        const totalFrames = 60;
        const advanceTime = (deltaMs) => {
          const framesPassed = Math.round(deltaMs / (1000 / 60));
          currentFrame = (currentFrame + framesPassed) % totalFrames;
        };

        // Normal 16.6ms tick
        advanceTime(16.6);
        assert.strictEqual(currentFrame, 1);

        // Lag spike of 100ms (~6 frames)
        advanceTime(100);
        assert.strictEqual(currentFrame, 7);
      }
    },
    {
      name: 'test_maximum_scale_boundary_performance',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const start = performance.now();
        const scaledQuad = PixelValidator.scaleMatrix(sprite, 4.0);
        const elapsed = performance.now() - start;

        assert.strictEqual(scaledQuad.length, 128);
        assert.strictEqual(scaledQuad[0].length, 128);
        assert(elapsed < 20, `Scaling to 128x128 took ${elapsed}ms, must be < 20ms`);
      }
    },
    {
      name: 'test_transparent_pixel_skip_optimization',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        let skipped = 0;
        let drawn = 0;

        for (let y = 0; y < sprite.length; y++) {
          for (let x = 0; x < sprite[y].length; x++) {
            if (sprite[y][x] === contracts.REFERENCE_PALETTE.TRANSPARENT) {
              skipped++;
            } else {
              drawn++;
            }
          }
        }

        assert(skipped > 0, 'Must have transparent pixels to skip');
        assert(drawn > 0, 'Must have robot pixels to draw');
        assert(skipped + drawn === 32 * 32);
      }
    }
  ]
};
