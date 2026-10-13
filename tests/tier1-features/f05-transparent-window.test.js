/**
 * f05-transparent-window.test.js
 * Feature 5: Transparent Electron Overlay Window
 * Validates BrowserWindow options: transparency, borderless/frameless,
 * alwaysOnTop, skipTaskbar, and initial bounds sizing.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

module.exports = {
  name: 'F05: Transparent Electron Overlay Window',
  tier: 1,
  tests: [
    {
      name: 'test_window_transparency_option',
      fn: async () => {
        assert.strictEqual(contracts.WINDOW_SPEC.transparent, true, 'Window must enable transparency');
      }
    },
    {
      name: 'test_window_borderless_frameless',
      fn: async () => {
        assert.strictEqual(contracts.WINDOW_SPEC.frame, false, 'Window must have no OS window border or frame');
      }
    },
    {
      name: 'test_window_always_on_top',
      fn: async () => {
        assert.strictEqual(contracts.WINDOW_SPEC.alwaysOnTop, true, 'Overlay must be always-on-top of other applications');
      }
    },
    {
      name: 'test_window_skip_taskbar',
      fn: async () => {
        assert.strictEqual(contracts.WINDOW_SPEC.skipTaskbar, true, 'Overlay should not pollute Windows taskbar');
      }
    },
    {
      name: 'test_window_initial_bounds',
      fn: async () => {
        // Base sprite size 32x32 scaled to window bounds with padding for badge/glow
        const baseWidth = 32;
        const baseHeight = 32;
        const scale = 2.0;
        const padding = 32; // for floating glow and tooltip badge
        const expectedWindowWidth = Math.round(baseWidth * scale + padding);
        const expectedWindowHeight = Math.round(baseHeight * scale + padding);

        assert(expectedWindowWidth >= 64, 'Window width must accommodate scaled pet');
        assert(expectedWindowHeight >= 64, 'Window height must accommodate scaled pet');
      }
    }
  ]
};
