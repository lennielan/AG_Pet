/**
 * workload-3-dual-monitor-drag-persist.test.js
 * Tier 4 Workload 3: Dual Monitor Dragging & Config Save/Load on Restart
 * Window Dragging Across Dual Monitors & Config Save/Load on Restart.
 */

const assert = require('node:assert');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');
const { PixelValidator, contracts } = TestHarness;

module.exports = {
  name: 'Workload 3: Dual Monitor Drag & Persist',
  tier: 4,
  tests: [
    {
      name: 'test_dual_monitor_drag_and_restart_persistence',
      fn: async () => {
        const harness = new TestHarness('Workload 3');
        const tmpDir = harness.createTempDir('workload-drag-');
        const configPath = path.join(tmpDir, 'config.json');

        // Initial setup on Primary monitor (x: 100, y: 100)
        const session1 = TestHarness.createDragPersistModel({
          x: 100,
          y: 100,
          scale: 1.0,
          isMuted: false
        });

        // 1. User drags pet across monitor boundary to left monitor (-1920 to 0)
        session1.startDrag(50, 50);
        session1.dragMove(-1450, 350); // Moved -1500px on X, +300px on Y
        const draggedCfg = session1.endDrag();

        assert.strictEqual(draggedCfg.x, -1400);
        assert.strictEqual(draggedCfg.y, 400);

        // 2. User sets scale to 1.5x and mutes audio via context menu
        draggedCfg.scale = 1.5;
        draggedCfg.isMuted = true;
        draggedCfg.wsPort = 9222;

        // Persist to disk
        const saveModel = TestHarness.createDragPersistModel(draggedCfg);
        saveModel.endDrag(configPath);

        // Validate schema on disk
        const validation = contracts.validatePetConfig(draggedCfg);
        assert.strictEqual(validation.valid, true);

        // 3. Simulate application restart: session 2 loads config from disk
        const session2 = TestHarness.createDragPersistModel({ x: 0, y: 0, scale: 1.0, isMuted: false });
        const restoredConfig = session2.loadConfig(configPath);

        assert.strictEqual(restoredConfig.x, -1400, 'Negative multi-monitor X coord preserved');
        assert.strictEqual(restoredConfig.y, 400, 'Multi-monitor Y coord preserved');
        assert.strictEqual(restoredConfig.scale, 1.5, '1.5x scale preserved');
        assert.strictEqual(restoredConfig.isMuted, true, 'Mute setting preserved');

        // 4. Invariant check: 1.5x scaling preserves crisp pixelation
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const scaled = PixelValidator.scaleMatrix(sprite, restoredConfig.scale);
        const check = PixelValidator.validateCrispScaling(sprite, scaled, 1.5);
        assert.strictEqual(check.valid, true);
        assert.strictEqual(scaled.length, 48);

        await harness.cleanup();
      }
    }
  ]
};
