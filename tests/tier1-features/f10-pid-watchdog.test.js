/**
 * f10-pid-watchdog.test.js
 * Feature 10: Parent Process PID Watchdog
 * Validates watchdog loop checking parent PID, crash detection,
 * detection latency, graceful exit trigger, and zero orphan processes.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'F10: Parent Process PID Watchdog',
  tier: 1,
  tests: [
    {
      name: 'test_watchdog_detects_live_parent_pid',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let parentDiedTriggered = false;
        const watchdog = TestHarness.createMockProcess().constructor.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 50,
          onParentDied: () => { parentDiedTriggered = true; }
        });

        // Wait 150ms while process is alive
        await new Promise(r => setTimeout(r, 150));
        assert.strictEqual(parentDiedTriggered, false, 'Watchdog should not trigger while parent is alive');

        watchdog.stop();
        await harness.cleanup();
      }
    },
    {
      name: 'test_watchdog_detects_parent_crash',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let diedFired = false;
        const watchdog = TestHarness.createMockProcess().constructor.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 40,
          onParentDied: () => { diedFired = true; }
        });

        // Kill parent hard
        await proc.killCrash();

        // Allow watchdog interval to detect
        await new Promise(r => setTimeout(r, 120));
        assert.strictEqual(diedFired, true, 'Watchdog must trigger on parent crash');

        watchdog.stop();
        await harness.cleanup();
      }
    },
    {
      name: 'test_watchdog_detection_latency',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let deathDetectedAt = 0;
        let killAt = 0;

        const watchdog = TestHarness.createMockProcess().constructor.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 50,
          onParentDied: () => { deathDetectedAt = performance.now(); }
        });

        killAt = performance.now();
        await proc.killCrash();

        await new Promise(r => setTimeout(r, 200));
        assert(deathDetectedAt > 0, 'Death must have been detected');
        const latencyMs = deathDetectedAt - killAt;
        assert(latencyMs <= 500, `Watchdog detection latency (${latencyMs}ms) must be under 500ms`);

        watchdog.stop();
        await harness.cleanup();
      }
    },
    {
      name: 'test_watchdog_graceful_exit_trigger',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let diedFired = false;
        const watchdog = TestHarness.createMockProcess().constructor.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 40,
          onParentDied: () => { diedFired = true; }
        });

        await proc.killGraceful();
        await new Promise(r => setTimeout(r, 150));
        assert.strictEqual(diedFired, true, 'Graceful exit must trigger watchdog termination');

        watchdog.stop();
        await harness.cleanup();
      }
    },
    {
      name: 'test_zero_orphan_processes_on_parent_death',
      fn: async () => {
        const harness = new TestHarness();
        const proc = harness.createMockProcess();
        const { pid } = await proc.spawn();

        let overlayExited = false;
        const mockOverlayApp = {
          exit: () => { overlayExited = true; }
        };

        const watchdog = TestHarness.createMockProcess().constructor.startWatchdog({
          parentPid: pid,
          checkIntervalMs: 40,
          onParentDied: () => { mockOverlayApp.exit(); }
        });

        await proc.killCrash();
        await new Promise(r => setTimeout(r, 120));
        assert.strictEqual(overlayExited, true, 'Overlay application must exit cleanly to prevent orphan processes');

        watchdog.stop();
        await harness.cleanup();
      }
    }
  ]
};
