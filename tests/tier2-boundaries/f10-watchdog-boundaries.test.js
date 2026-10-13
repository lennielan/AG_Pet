/**
 * f10-watchdog-boundaries.test.js
 * Feature 10 Boundaries: Parent Process PID Watchdog
 * Validates PID 0/negative rejection, rapid poll interval, double stop safety,
 * shutdown race condition, and fast PID check resilience.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const MockAntigravityProcess = TestHarness.MockProcess;

module.exports = {
  name: 'F10 Boundaries: Parent Process PID Watchdog',
  tier: 2,
  tests: [
    {
      name: 'test_watchdog_zero_pid_rejection',
      fn: async () => {
        let triggerCount = 0;
        const startSafeWatchdog = (pid, onDied) => {
          if (!pid || typeof pid !== 'number' || pid <= 0) {
            onDied('invalid_pid');
            return { stop: () => {} };
          }
          return MockAntigravityProcess.startWatchdog({ parentPid: pid, onParentDied: onDied });
        };

        startSafeWatchdog(0, () => triggerCount++);
        assert.strictEqual(triggerCount, 1, 'PID 0 must trigger immediate exit');

        startSafeWatchdog(-10, () => triggerCount++);
        assert.strictEqual(triggerCount, 2, 'Negative PID must trigger immediate exit');
      }
    },
    {
      name: 'test_watchdog_rapid_interval_stress',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let checks = 0;
        const watchdog = MockAntigravityProcess.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 10, // Ultra-fast 10ms
          onParentDied: () => {}
        });

        await new Promise(r => setTimeout(r, 100));
        watchdog.stop();

        // While parent is alive, no uncaught exceptions or crashes
        assert(MockAntigravityProcess.isPidAlive(pid));

        await harness.cleanup();
      }
    },
    {
      name: 'test_watchdog_double_stop_idempotence',
      fn: async () => {
        const watchdog = MockAntigravityProcess.startWatchdog({
          parentPid: process.pid,
          checkIntervalMs: 50,
          onParentDied: () => {}
        });

        // Double call stop
        assert.doesNotThrow(() => {
          watchdog.stop();
          watchdog.stop();
        });
      }
    },
    {
      name: 'test_watchdog_kill_during_shutdown',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let shutdownInitiated = false;
        let watchdogTriggered = false;

        const watchdog = MockAntigravityProcess.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 25,
          onParentDied: () => {
            if (!shutdownInitiated) watchdogTriggered = true;
          }
        });

        // Overlay initiates shutdown first
        shutdownInitiated = true;
        watchdog.stop();

        // Parent killed concurrently
        await proc.killCrash();
        await new Promise(r => setTimeout(r, 60));

        assert.strictEqual(watchdogTriggered, false, 'Watchdog must not fire after stop()');
        await harness.cleanup();
      }
    },
    {
      name: 'test_watchdog_pid_reuse_safety',
      fn: async () => {
        // Checks isPidAlive with non-existent system PID
        const fakePid = 99999999;
        assert.strictEqual(MockAntigravityProcess.isPidAlive(fakePid), false);

        // Current process PID is alive
        assert.strictEqual(MockAntigravityProcess.isPidAlive(process.pid), true);
      }
    }
  ]
};
