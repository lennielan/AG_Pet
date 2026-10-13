/**
 * multi-screen-drag-with-scale.test.js
 * Tier 3 Pairwise: F06 (Multi-Monitor Drag) × F07 (Scale 1.5x)
 * Validates moving scaled pet to secondary monitor with persistence.
 */

const assert = require('node:assert');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Multi-Screen Drag with Scale',
  tier: 3,
  tests: [
    {
      name: 'test_scaled_pet_drag_to_secondary_monitor_and_persist',
      fn: async () => {
        const harness = new TestHarness();
        const tmpDir = harness.createTempDir('multi-screen-');
        const cfgPath = path.join(tmpDir, 'config.json');

        const dragModel = TestHarness.createDragPersistModel({ x: 200, y: 200, scale: 1.5, isMuted: false });
        // Drag to left secondary monitor (x < 0)
        dragModel.startDrag(0, 0);
        dragModel.dragMove(-1400, 50);
        const saved = dragModel.endDrag(cfgPath);

        assert.strictEqual(saved.x, -1200);
        assert.strictEqual(saved.scale, 1.5);

        // Reload from disk
        const reloaded = dragModel.loadConfig(cfgPath);
        assert.strictEqual(reloaded.x, -1200);
        assert.strictEqual(reloaded.scale, 1.5);

        await harness.cleanup();
      }
    }
  ]
};
