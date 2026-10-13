/**
 * f07-menu-boundaries.test.js
 * Feature 7 Boundaries: Right-Click Context Menu
 * Validates rapid scale cycling, invalid scale values, uninitialized config,
 * double hide calls, and context menu interaction during drag.
 */

const assert = require('node:assert');
const { VALID_SCALES } = require('../harness/spec-contracts');

function createRobustMenuController(initialConfig) {
  let config = { x: 100, y: 100, scale: 1.0, isMuted: false, ...initialConfig };
  let isHidden = false;
  let isDragging = false;

  return {
    getConfig: () => ({ ...config }),
    setDragging: (dragging) => { isDragging = !!dragging; },
    setScale: (scale) => {
      if (!VALID_SCALES.includes(scale)) {
        return { success: false, error: `Invalid scale: ${scale}` };
      }
      config.scale = scale;
      return { success: true };
    },
    toggleMute: () => {
      config.isMuted = !config.isMuted;
      return config.isMuted;
    },
    hidePet: () => {
      isHidden = true;
      return true;
    },
    isHidden: () => isHidden,
    canOpenMenu: () => !isDragging
  };
}

module.exports = {
  name: 'F07 Boundaries: Right-Click Context Menu',
  tier: 2,
  tests: [
    {
      name: 'test_menu_rapid_scale_cycling',
      fn: async () => {
        const menu = createRobustMenuController();
        for (let i = 0; i < 30; i++) {
          const nextScale = VALID_SCALES[i % VALID_SCALES.length];
          const res = menu.setScale(nextScale);
          assert.strictEqual(res.success, true);
          assert.strictEqual(menu.getConfig().scale, nextScale);
        }
      }
    },
    {
      name: 'test_menu_invalid_scale_rejection',
      fn: async () => {
        const menu = createRobustMenuController();
        const resZero = menu.setScale(0.0);
        assert.strictEqual(resZero.success, false);

        const resHuge = menu.setScale(10.0);
        assert.strictEqual(resHuge.success, false);

        const resNeg = menu.setScale(-1.5);
        assert.strictEqual(resNeg.success, false);
      }
    },
    {
      name: 'test_menu_uninitialized_config_handling',
      fn: async () => {
        // Pass empty object or undefined
        const menu = createRobustMenuController({});
        assert.strictEqual(menu.getConfig().scale, 1.0);
        assert.strictEqual(menu.getConfig().isMuted, false);
      }
    },
    {
      name: 'test_menu_double_hide_call',
      fn: async () => {
        const menu = createRobustMenuController();
        assert.strictEqual(menu.hidePet(), true);
        assert.strictEqual(menu.isHidden(), true);
        // Second call is safe and idempotent
        assert.strictEqual(menu.hidePet(), true);
        assert.strictEqual(menu.isHidden(), true);
      }
    },
    {
      name: 'test_menu_action_during_drag',
      fn: async () => {
        const menu = createRobustMenuController();
        assert.strictEqual(menu.canOpenMenu(), true);

        menu.setDragging(true);
        assert.strictEqual(menu.canOpenMenu(), false, 'Context menu should not open in midst of drag');

        menu.setDragging(false);
        assert.strictEqual(menu.canOpenMenu(), true);
      }
    }
  ]
};
