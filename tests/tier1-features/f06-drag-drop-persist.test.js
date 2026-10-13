/**
 * f06-drag-drop-persist.test.js
 * Feature 6: Drag & Drop Multi-Monitor & Persist
 * Validates mouse delta translation, negative coords on multi-monitor,
 * disk persistence, schema validation, and config reloading.
 */

const assert = require('node:assert');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

module.exports = {
  name: 'F06: Drag & Drop Multi-Monitor & Persist',
  tier: 1,
  tests: [
    {
      name: 'test_drag_delta_calculation',
      fn: async () => {
        const model = TestHarness.createDragPersistModel({ x: 100, y: 150, scale: 1.0, isMuted: false });
        model.startDrag(50, 50);
        model.dragMove(80, 110); // moved dx=+30, dy=+60
        const cfg = model.endDrag();
        assert.strictEqual(cfg.x, 130, 'x should be 100 + 30');
        assert.strictEqual(cfg.y, 210, 'y should be 150 + 60');
      }
    },
    {
      name: 'test_negative_coordinates_multi_monitor',
      fn: async () => {
        // Multi-monitor: secondary monitor placed to the left has negative x coordinates
        const model = TestHarness.createDragPersistModel({ x: 100, y: 100, scale: 1.0, isMuted: false });
        model.startDrag(200, 200);
        model.dragMove(-1200, 300); // dragged to left screen
        const cfg = model.endDrag();
        assert(cfg.x < 0, 'Virtual desktop coordinate x can be negative on secondary monitor');
        const validation = contracts.validatePetConfig(cfg);
        assert.strictEqual(validation.valid, true, 'Negative virtual coordinates are valid');
      }
    },
    {
      name: 'test_config_persistence_to_disk',
      fn: async () => {
        const harness = new TestHarness();
        const tmpDir = harness.createTempDir('drag-test-');
        const configPath = path.join(tmpDir, 'config.json');

        const model = TestHarness.createDragPersistModel({ x: 450, y: 320, scale: 1.5, isMuted: true });
        model.startDrag(10, 10);
        model.dragMove(60, 40);
        model.endDrag(configPath);

        const loaded = model.loadConfig(configPath);
        assert.strictEqual(loaded.x, 500);
        assert.strictEqual(loaded.y, 350);
        assert.strictEqual(loaded.scale, 1.5);
        assert.strictEqual(loaded.isMuted, true);

        await harness.cleanup();
      }
    },
    {
      name: 'test_config_schema_validation',
      fn: async () => {
        const validConfig = { x: 300, y: 400, scale: 2.0, isMuted: false, parentPid: 1234, wsPort: 8080 };
        const check = contracts.validatePetConfig(validConfig);
        assert.strictEqual(check.valid, true);

        const invalidScale = { x: 300, y: 400, scale: 3.5, isMuted: false };
        const checkInvalid = contracts.validatePetConfig(invalidScale);
        assert.strictEqual(checkInvalid.valid, false);
      }
    },
    {
      name: 'test_config_reload_preserves_position',
      fn: async () => {
        const harness = new TestHarness();
        const tmpDir = harness.createTempDir('drag-reload-');
        const configPath = path.join(tmpDir, 'config.json');

        const instance1 = TestHarness.createDragPersistModel({ x: 720, y: 640, scale: 1.0, isMuted: false });
        instance1.endDrag(configPath);

        const instance2 = TestHarness.createDragPersistModel({ x: 0, y: 0, scale: 1.0, isMuted: false });
        const restored = instance2.loadConfig(configPath);
        assert.strictEqual(restored.x, 720);
        assert.strictEqual(restored.y, 640);

        await harness.cleanup();
      }
    }
  ]
};
