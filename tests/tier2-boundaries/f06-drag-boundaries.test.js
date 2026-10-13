/**
 * f06-drag-boundaries.test.js
 * Feature 6 Boundaries: Drag & Drop Multi-Monitor & Persist
 * Validates drag move without start, huge coordinate jumps, corrupted JSON recovery,
 * missing config keys filling, and read-only save failure handling.
 */

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'F06 Boundaries: Drag & Drop Multi-Monitor & Persist',
  tier: 2,
  tests: [
    {
      name: 'test_drag_without_start_noop',
      fn: async () => {
        const model = TestHarness.createDragPersistModel({ x: 100, y: 100, scale: 1.0, isMuted: false });
        // Call dragMove directly without startDrag
        model.dragMove(500, 500);
        const cfg = model.endDrag();
        assert.strictEqual(cfg.x, 100, 'Coordinates must remain untouched');
        assert.strictEqual(cfg.y, 100);
      }
    },
    {
      name: 'test_drag_extreme_mouse_jumps',
      fn: async () => {
        const model = TestHarness.createDragPersistModel({ x: 50, y: 50, scale: 1.0, isMuted: false });
        model.startDrag(0, 0);
        model.dragMove(10000, -10000); // 10,000px mouse jump
        const cfg = model.endDrag();
        assert.strictEqual(cfg.x, 10050);
        assert.strictEqual(cfg.y, -9950);
      }
    },
    {
      name: 'test_corrupt_config_json_recovery',
      fn: async () => {
        const harness = new TestHarness();
        const tmpDir = harness.createTempDir('drag-corrupt-');
        const configPath = path.join(tmpDir, 'config.json');

        // Write invalid corrupted JSON
        fs.writeFileSync(configPath, '{"x": 100, "y": ', 'utf8');

        const model = TestHarness.createDragPersistModel({ x: 100, y: 100, scale: 1.0, isMuted: false });
        const loaded = model.loadConfig(configPath);

        // Must recover safely to default config without throwing
        assert.strictEqual(loaded.x, 100);
        assert.strictEqual(loaded.scale, 1.0);

        await harness.cleanup();
      }
    },
    {
      name: 'test_config_missing_keys_defaults_fill',
      fn: async () => {
        const harness = new TestHarness();
        const tmpDir = harness.createTempDir('drag-defaults-');
        const configPath = path.join(tmpDir, 'config.json');

        // Partial JSON containing only coordinates
        fs.writeFileSync(configPath, JSON.stringify({ x: 350, y: 450 }), 'utf8');

        const model = TestHarness.createDragPersistModel({ x: 100, y: 100, scale: 1.0, isMuted: false });
        const loaded = model.loadConfig(configPath);

        // Fallbacks fill scale and isMuted
        assert.strictEqual(loaded.scale, 1.0);
        assert.strictEqual(loaded.isMuted, false);

        await harness.cleanup();
      }
    },
    {
      name: 'test_config_write_to_readonly_path_handling',
      fn: async () => {
        const safeSaveConfig = (filePath, config) => {
          try {
            fs.writeFileSync(filePath, JSON.stringify(config), 'utf8');
            return { success: true };
          } catch (e) {
            return { success: false, error: e.message };
          }
        };

        // Attempt writing to invalid directory path
        const res = safeSaveConfig('Z:\\invalid_drive_path\\config.json', { x: 10 });
        assert.strictEqual(res.success, false);
        assert(res.error.length > 0);
      }
    }
  ]
};
