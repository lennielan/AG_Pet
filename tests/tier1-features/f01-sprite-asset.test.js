/**
 * f01-sprite-asset.test.js
 * Feature 1: Reference Pixel-Art Robot Sprite
 * Validates canonical dimensions, palette adherence, anatomy components,
 * contrast, and symmetry.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { PixelValidator, contracts } = TestHarness;

module.exports = {
  name: 'F01: Reference Pixel-Art Robot Sprite',
  tier: 1,
  tests: [
    {
      name: 'test_canonical_dimensions_32x32',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const dimCheck = PixelValidator.validateDimensions(sprite, 32, 32);
        assert.strictEqual(dimCheck.valid, true, dimCheck.error);
        assert.strictEqual(sprite.length, 32, 'Height must be exactly 32 pixels');
        assert.strictEqual(sprite[0].length, 32, 'Width must be exactly 32 pixels');
      }
    },
    {
      name: 'test_reference_palette_adherence',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const paletteCheck = PixelValidator.validatePalette(sprite);
        assert.strictEqual(paletteCheck.valid, true, paletteCheck.error);
        assert.strictEqual(paletteCheck.violationsCount, 0, 'No unauthorized palette colors allowed');
      }
    },
    {
      name: 'test_robot_anatomy_components',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const anatomyCheck = PixelValidator.validateRobotAnatomy(sprite);
        assert.strictEqual(anatomyCheck.valid, true, anatomyCheck.error);
        assert.deepStrictEqual(anatomyCheck.missingAnatomy, [], 'All anatomical components must be present');
      }
    },
    {
      name: 'test_crisp_pixel_contrast',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        // Screen background (dark) vs screen eyes (cyan glow)
        const eyeColor = PixelValidator.normalizeColor(sprite[10][13]);
        const screenBgColor = PixelValidator.normalizeColor(sprite[9][13]);
        assert.strictEqual(eyeColor, contracts.REFERENCE_PALETTE.SCREEN_CYAN_GLOW);
        assert.strictEqual(screenBgColor, contracts.REFERENCE_PALETTE.SCREEN_BG);
        assert.notStrictEqual(eyeColor, screenBgColor, 'Eye pixels must have high contrast with screen background');
      }
    },
    {
      name: 'test_chassis_horizontal_symmetry',
      fn: async () => {
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        // Check chassis width symmetry across row 12 (head/dome) and row 18 (torso)
        for (const y of [12, 18]) {
          const row = sprite[y];
          let leftFilled = 0;
          let rightFilled = 0;
          for (let x = 0; x < 16; x++) {
            if (row[x] !== contracts.REFERENCE_PALETTE.TRANSPARENT) leftFilled++;
          }
          for (let x = 16; x < 32; x++) {
            if (row[x] !== contracts.REFERENCE_PALETTE.TRANSPARENT) rightFilled++;
          }
          assert.strictEqual(leftFilled, rightFilled, `Row ${y} chassis must be horizontally symmetric around center`);
        }
      }
    }
  ]
};
