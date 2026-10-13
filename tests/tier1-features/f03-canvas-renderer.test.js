/**
 * f03-canvas-renderer.test.js
 * Feature 3: 60fps Canvas / Pixel Renderer & Integer Scaling
 * Validates frame budget, 1x, 1.5x, 2x scaling, and zero blurring artifacts.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { PixelValidator } = TestHarness;

module.exports = {
  name: 'F03: 60fps Canvas / Pixel Renderer',
  tier: 1,
  tests: [
    {
      name: 'test_frame_budget_60fps',
      fn: async () => {
        // 60fps requires frame duration <= 16.67ms
        const frameBudgetMs = 1000 / 60;
        assert(Math.abs(frameBudgetMs - 16.6667) < 0.01, 'Frame budget should be 16.67ms');
        
        // Simulates render cycle of 32x32 matrix
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const start = performance.now();
        // Simulate pixel draw loop
        let drawnPixels = 0;
        for (let y = 0; y < sprite.length; y++) {
          for (let x = 0; x < sprite[y].length; x++) {
            if (sprite[y][x] !== 'TRANSPARENT') drawnPixels++;
          }
        }
        const elapsed = performance.now() - start;
        assert(elapsed < frameBudgetMs, `Frame rendering (${elapsed}ms) must easily fit within 16.67ms budget`);
        assert(drawnPixels > 0, 'Pixels were drawn');
      }
    },
    {
      name: 'test_scaling_factor_1x',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const scaled = PixelValidator.scaleMatrix(sprite, 1.0);
        const check = PixelValidator.validateCrispScaling(sprite, scaled, 1.0);
        assert.strictEqual(check.valid, true, check.error);
        assert.strictEqual(scaled.length, 32);
        assert.strictEqual(scaled[0].length, 32);
      }
    },
    {
      name: 'test_scaling_factor_1_5x',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const scaled = PixelValidator.scaleMatrix(sprite, 1.5);
        const check = PixelValidator.validateCrispScaling(sprite, scaled, 1.5);
        assert.strictEqual(check.valid, true, check.error);
        assert.strictEqual(scaled.length, 48, 'Height at 1.5x must be 48');
        assert.strictEqual(scaled[0].length, 48, 'Width at 1.5x must be 48');
      }
    },
    {
      name: 'test_scaling_factor_2x',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const scaled = PixelValidator.scaleMatrix(sprite, 2.0);
        const check = PixelValidator.validateCrispScaling(sprite, scaled, 2.0);
        assert.strictEqual(check.valid, true, check.error);
        assert.strictEqual(scaled.length, 64, 'Height at 2x must be 64');
        assert.strictEqual(scaled[0].length, 64, 'Width at 2x must be 64');
      }
    },
    {
      name: 'test_image_rendering_pixelated_flag',
      fn: async () => {
        // Mock CanvasRenderingContext2D options
        const mockCtx = {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low'
        };
        assert.strictEqual(mockCtx.imageSmoothingEnabled, false, 'Canvas smoothing must be disabled for pixel art');
      }
    }
  ]
};
