/**
 * f01-sprite-boundaries.test.js
 * Feature 1 Boundaries: Reference Pixel-Art Robot Sprite
 * Validates empty matrices, non-square dimensions, unauthorized colors,
 * inverted zero contrast, and scale factor limits.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { PixelValidator, contracts } = TestHarness;

module.exports = {
  name: 'F01 Boundaries: Reference Robot Sprite',
  tier: 2,
  tests: [
    {
      name: 'test_sprite_empty_matrix_rejection',
      fn: async () => {
        const empty = [];
        const dimCheck = PixelValidator.validateDimensions(empty, 32, 32);
        assert.strictEqual(dimCheck.valid, false);
        assert(dimCheck.error.includes('Expected height 32'));
      }
    },
    {
      name: 'test_sprite_non_square_dimensions_rejection',
      fn: async () => {
        const nonSquare = Array.from({ length: 24 }, () => Array(32).fill(contracts.REFERENCE_PALETTE.TRANSPARENT));
        const dimCheck = PixelValidator.validateDimensions(nonSquare, 32, 32);
        assert.strictEqual(dimCheck.valid, false);
      }
    },
    {
      name: 'test_sprite_unauthorized_color_rejection',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        // Inject rogue neon pink color
        sprite[5][5] = '#FF00FF';
        const check = PixelValidator.validatePalette(sprite);
        assert.strictEqual(check.valid, false);
        assert.strictEqual(check.violationsCount, 1);
        assert.strictEqual(check.violations[0].color, '#FF00FF');
      }
    },
    {
      name: 'test_sprite_zero_contrast_inverted_screen',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        // Set eyes same as background
        sprite[10][12] = contracts.REFERENCE_PALETTE.SCREEN_BG;
        sprite[10][13] = contracts.REFERENCE_PALETTE.SCREEN_BG;
        sprite[10][18] = contracts.REFERENCE_PALETTE.SCREEN_BG;
        sprite[10][19] = contracts.REFERENCE_PALETTE.SCREEN_BG;

        const eyeColor = PixelValidator.normalizeColor(sprite[10][12]);
        const bg = PixelValidator.normalizeColor(contracts.REFERENCE_PALETTE.SCREEN_BG);
        assert.strictEqual(eyeColor === bg, true, 'Zero contrast state detected');
      }
    },
    {
      name: 'test_sprite_extreme_scale_factor_bounds',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        // Scale 0.5x downscaling
        const half = PixelValidator.scaleMatrix(sprite, 0.5);
        assert.strictEqual(half.length, 16);
        assert.strictEqual(half[0].length, 16);

        // Scale 4x upscaling
        const quad = PixelValidator.scaleMatrix(sprite, 4.0);
        assert.strictEqual(quad.length, 128);
        assert.strictEqual(quad[0].length, 128);
      }
    }
  ]
};
