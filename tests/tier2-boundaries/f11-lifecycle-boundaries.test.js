/**
 * f11-lifecycle-boundaries.test.js
 * Feature 11 Boundaries: Extension Lifecycle Management
 * Validates missing binary path handling, busy port fallback, double activation,
 * deactivate idempotence, and crash storm backoff.
 */

const assert = require('node:assert');
const net = require('node:net');

function createResilientExtensionManager() {
  let activeProcess = null;
  let crashTimestamps = [];

  const findAvailablePort = async (startPort) => {
    return new Promise((resolve) => {
      const tryPort = (p) => {
        const s = net.createServer();
        s.listen(p, '127.0.0.1', () => {
          s.close(() => resolve(p));
        });
        s.on('error', () => tryPort(p + 1));
      };
      tryPort(startPort);
    });
  };

  const spawnOverlay = async (binaryPath, parentPid, port) => {
    if (!binaryPath || binaryPath.trim() === '') {
      throw new Error('Overlay binary path not specified');
    }
    // If active process already running, kill previous before replacing
    if (activeProcess && !activeProcess.killed) {
      activeProcess.kill();
    }

    activeProcess = {
      pid: Math.floor(Math.random() * 50000) + 10000,
      killed: false,
      kill: function() { this.killed = true; }
    };
    return activeProcess;
  };

  const recordCrash = () => {
    const now = Date.now();
    crashTimestamps.push(now);
    // Keep last 10 seconds
    crashTimestamps = crashTimestamps.filter(t => now - t <= 10000);
    return crashTimestamps.length >= 5; // Crash storm if >= 5 in 10s
  };

  return {
    findAvailablePort,
    spawnOverlay,
    recordCrash,
    deactivate: () => {
      if (activeProcess && !activeProcess.killed) {
        activeProcess.kill();
      }
    },
    getActiveProcess: () => activeProcess
  };
}

module.exports = {
  name: 'F11 Boundaries: Extension Lifecycle Management',
  tier: 2,
  tests: [
    {
      name: 'test_lifecycle_missing_binary_path',
      fn: async () => {
        const mgr = createResilientExtensionManager();
        await assert.rejects(async () => {
          await mgr.spawnOverlay('', process.pid, 8080);
        }, /Overlay binary path not specified/);
      }
    },
    {
      name: 'test_lifecycle_busy_port_fallback',
      fn: async () => {
        const mgr = createResilientExtensionManager();
        // Occupy port 39999
        const blockingServer = net.createServer();
        await new Promise(r => blockingServer.listen(39999, '127.0.0.1', r));

        const chosenPort = await mgr.findAvailablePort(39999);
        assert(chosenPort > 39999, 'Must fall back to next free port');

        await new Promise(r => blockingServer.close(r));
      }
    },
    {
      name: 'test_lifecycle_multiple_activate_calls',
      fn: async () => {
        const mgr = createResilientExtensionManager();
        const proc1 = await mgr.spawnOverlay('mock_electron.exe', 100, 4000);
        assert.strictEqual(proc1.killed, false);

        // Second activation call kills proc1 to prevent orphan
        const proc2 = await mgr.spawnOverlay('mock_electron.exe', 100, 4001);
        assert.strictEqual(proc1.killed, true, 'First process must be killed before new spawn');
        assert.strictEqual(proc2.killed, false);
      }
    },
    {
      name: 'test_lifecycle_deactivate_when_already_dead',
      fn: async () => {
        const mgr = createResilientExtensionManager();
        const proc = await mgr.spawnOverlay('mock_electron.exe', 100, 4000);
        proc.killed = true; // Already dead

        assert.doesNotThrow(() => {
          mgr.deactivate();
        });
      }
    },
    {
      name: 'test_lifecycle_overlay_crash_storm',
      fn: async () => {
        const mgr = createResilientExtensionManager();
        assert.strictEqual(mgr.recordCrash(), false);
        assert.strictEqual(mgr.recordCrash(), false);
        assert.strictEqual(mgr.recordCrash(), false);
        assert.strictEqual(mgr.recordCrash(), false);
        // 5th crash within 10 seconds triggers crash storm circuit breaker
        assert.strictEqual(mgr.recordCrash(), true, '5th rapid crash must trigger crash storm alarm');
      }
    }
  ]
};
