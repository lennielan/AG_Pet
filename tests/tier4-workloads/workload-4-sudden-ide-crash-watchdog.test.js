/**
 * workload-4-sudden-ide-crash-watchdog.test.js
 * Tier 4 Workload 4: Sudden IDE Process Crash
 * Kill PID → Overlay watchdog terminates in <500ms without orphan processes.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const MockAntigravityProcess = TestHarness.MockProcess;

module.exports = {
  name: 'Workload 4: Sudden IDE Crash Watchdog',
  tier: 4,
  tests: [
    {
      name: 'test_sudden_ide_crash_terminates_overlay_promptly',
      fn: async () => {
        const harness = new TestHarness('Workload 4');

        // 1. Antigravity IDE parent process launched
        const proc = harness.createMockProcess();
        const { pid: parentPid } = await proc.spawn();
        assert(parentPid > 0);
        assert.strictEqual(MockAntigravityProcess.isPidAlive(parentPid), true);

        // 2. Overlay launches and registers watchdog
        let overlayTerminated = false;
        let terminationTimestamp = 0;

        const watchdog = MockAntigravityProcess.startWatchdog({
          parentPid,
          checkIntervalMs: 50,
          onParentDied: () => {
            overlayTerminated = true;
            terminationTimestamp = performance.now();
          }
        });

        // 3. Normal operation for 100ms
        await new Promise(r => setTimeout(r, 100));
        assert.strictEqual(overlayTerminated, false, 'Overlay must remain running while parent PID is alive');

        // 4. Sudden ungraceful IDE crash (SIGKILL / hard termination)
        const killStart = performance.now();
        await proc.killCrash();

        // 5. Watchdog detects death
        await new Promise(r => setTimeout(r, 250));

        assert.strictEqual(overlayTerminated, true, 'Overlay watchdog must detect parent crash');
        const detectionDelay = terminationTimestamp - killStart;
        assert(detectionDelay <= 500, `Termination delay (${detectionDelay}ms) must be < 500ms`);

        // 6. Zero orphan check
        assert.strictEqual(MockAntigravityProcess.isPidAlive(parentPid), false);

        watchdog.stop();
        await harness.cleanup();
      }
    }
  ]
};
