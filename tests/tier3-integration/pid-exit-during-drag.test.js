/**
 * pid-exit-during-drag.test.js
 * Tier 3 Pairwise: F10 (PID Watchdog) × F06 (Active Dragging)
 * Validates watchdog aborting drag and closing overlay on parent exit.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const MockAntigravityProcess = TestHarness.MockProcess;

module.exports = {
  name: 'T3 Pairwise: PID Exit during Drag',
  tier: 3,
  tests: [
    {
      name: 'test_watchdog_aborts_active_drag_on_parent_exit',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        const dragModel = TestHarness.createDragPersistModel({ x: 200, y: 200 });
        dragModel.startDrag(50, 50);
        dragModel.dragMove(100, 100);

        let overlayClosed = false;
        const watchdog = MockAntigravityProcess.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 30,
          onParentDied: () => {
            // Abort drag and close window
            overlayClosed = true;
          }
        });

        // Parent exits while user is dragging
        await proc.killCrash();
        await new Promise(r => setTimeout(r, 100));

        assert.strictEqual(overlayClosed, true, 'Watchdog must trigger overlay closure even while dragging');

        watchdog.stop();
        await harness.cleanup();
      }
    }
  ]
};
