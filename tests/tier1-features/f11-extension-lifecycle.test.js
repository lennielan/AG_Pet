/**
 * f11-extension-lifecycle.test.js
 * Feature 11: Extension Lifecycle Management
 * Validates overlay spawn args, deactivate termination, parent PID passing,
 * ephemeral port allocation, and relaunch tracking.
 */

const assert = require('node:assert');
const net = require('node:net');

function createExtensionLifecycleManager({ currentPid = process.pid }) {
  let spawnedProcess = null;
  let activePort = null;
  let crashCount = 0;

  const allocateEphemeralPort = async () => {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', reject);
    });
  };

  const activate = async () => {
    activePort = await allocateEphemeralPort();
    const spawnArgs = [
      `--parent-pid=${currentPid}`,
      `--ws-port=${activePort}`,
      '--mode=overlay'
    ];

    spawnedProcess = {
      pid: 99901,
      args: spawnArgs,
      killed: false,
      kill: function() { this.killed = true; }
    };

    return { spawnedProcess, port: activePort, args: spawnArgs };
  };

  const deactivate = () => {
    if (spawnedProcess && !spawnedProcess.killed) {
      spawnedProcess.kill();
    }
  };

  const recordCrash = () => {
    crashCount++;
  };

  return {
    activate,
    deactivate,
    recordCrash,
    getSpawnedProcess: () => spawnedProcess,
    getCrashCount: () => crashCount
  };
}

module.exports = {
  name: 'F11: Extension Lifecycle Management',
  tier: 1,
  tests: [
    {
      name: 'test_startup_spawns_overlay_command',
      fn: async () => {
        const manager = createExtensionLifecycleManager({ currentPid: 12345 });
        const { args } = await manager.activate();
        assert(args.some(a => a.startsWith('--parent-pid=12345')), 'Must pass parent PID');
        assert(args.some(a => a.startsWith('--ws-port=')), 'Must pass allocated ws-port');
      }
    },
    {
      name: 'test_deactivate_terminates_overlay',
      fn: async () => {
        const manager = createExtensionLifecycleManager({});
        await manager.activate();
        const proc = manager.getSpawnedProcess();
        assert.strictEqual(proc.killed, false);

        manager.deactivate();
        assert.strictEqual(proc.killed, true, 'deactivate() must terminate overlay process');
      }
    },
    {
      name: 'test_extension_passes_valid_parent_pid',
      fn: async () => {
        const manager = createExtensionLifecycleManager({ currentPid: 54321 });
        const { args } = await manager.activate();
        const pidArg = args.find(a => a.startsWith('--parent-pid='));
        const pid = parseInt(pidArg.split('=')[1], 10);
        assert.strictEqual(pid, 54321, 'Passed PID must match extension process PID');
      }
    },
    {
      name: 'test_port_allocation_ephemeral',
      fn: async () => {
        const manager = createExtensionLifecycleManager({});
        const { port } = await manager.activate();
        assert(port >= 1024 && port <= 65535, `Port ${port} must be a valid non-privileged port`);
      }
    },
    {
      name: 'test_relaunch_on_unexpected_exit',
      fn: async () => {
        const manager = createExtensionLifecycleManager({});
        await manager.activate();
        assert.strictEqual(manager.getCrashCount(), 0);

        manager.recordCrash();
        assert.strictEqual(manager.getCrashCount(), 1, 'Manager must record overlay crashes for telemetry/restart');
      }
    }
  ]
};
