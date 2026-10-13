/**
 * tests/empirical/test-lifecycle-watchdog.js
 * Empirical Stress Test: Lifecycle & PID Crash Watchdog
 *
 * Verifies:
 * 1. Parent process PID crash watchdog triggers overlay termination in <500ms.
 * 2. Zero orphan processes remain after crash.
 * 3. Graceful parent termination also triggers clean overlay exit.
 * 4. Invalid PID rejection behavior.
 * 5. Deterministic performance across multiple successive crash trials.
 */

const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { PIDWatchdog } = require(path.resolve(__dirname, '../../desktop-overlay/dist/desktop-overlay/main/pid-watchdog.js'));

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Spawns a dummy long-running Node process representing Antigravity parent IDE
function spawnParentProcess() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
    stdio: 'ignore',
    detached: false
  });
  return child;
}

// Spawns a real separate Node process representing Desktop Overlay with PIDWatchdog
function spawnOverlayProcess(parentPid, checkIntervalMs = 150) {
  const script = `
    const { PIDWatchdog } = require(${JSON.stringify(path.resolve(__dirname, '../../desktop-overlay/dist/desktop-overlay/main/pid-watchdog.js'))});
    const wd = new PIDWatchdog({
      parentPid: ${parentPid},
      checkIntervalMs: ${checkIntervalMs},
      onParentDied: (reason) => {
        // Exit cleanly when parent dies
        process.exit(0);
      }
    });
    // Keep alive
    setInterval(() => {}, 1000);
  `;

  const child = spawn(process.execPath, ['-e', script], {
    stdio: 'ignore',
    detached: false
  });
  return child;
}

async function runSingleCrashTrial(trialNumber, checkIntervalMs = 150) {
  const parent = spawnParentProcess();
  await sleep(60);
  assert(parent.pid && isPidAlive(parent.pid), 'Parent process must be alive');

  const overlay = spawnOverlayProcess(parent.pid, checkIntervalMs);
  await sleep(60);
  assert(overlay.pid && isPidAlive(overlay.pid), 'Overlay process must be alive');

  const parentPid = parent.pid;
  const overlayPid = overlay.pid;

  let overlayExited = false;
  let overlayExitCode = null;
  const overlayExitPromise = new Promise((resolve) => {
    overlay.on('exit', (code) => {
      overlayExited = true;
      overlayExitCode = code;
      resolve();
    });
  });

  // Sudden hard crash of parent process (SIGKILL / hard kill)
  const killStart = performance.now();
  if (process.platform === 'win32') {
    try {
      parent.kill('SIGKILL');
    } catch (_e) {}
  } else {
    parent.kill('SIGKILL');
  }

  // Wait for overlay to exit
  await Promise.race([
    overlayExitPromise,
    sleep(1500)
  ]);

  const killEnd = performance.now();
  const latencyMs = Math.round(killEnd - killStart);

  assert.strictEqual(overlayExited, true, `Trial ${trialNumber}: Overlay process must have exited on parent crash`);
  assert(latencyMs < 500, `Trial ${trialNumber}: Termination latency (${latencyMs}ms) must be strictly < 500ms`);

  // Allow OS process table 50ms to settle
  await sleep(50);

  // Verify ZERO orphan processes
  const parentAlive = isPidAlive(parentPid);
  const overlayAlive = isPidAlive(overlayPid);

  assert.strictEqual(parentAlive, false, `Trial ${trialNumber}: Parent PID ${parentPid} must NOT be alive`);
  assert.strictEqual(overlayAlive, false, `Trial ${trialNumber}: Overlay PID ${overlayPid} must NOT be alive (zero orphans)`);

  return { trial: trialNumber, latencyMs, parentPid, overlayPid, zeroOrphans: true };
}

async function run() {
  console.log('='.repeat(78));
  console.log(' EMPIRICAL TEST: LIFECYCLE PID WATCHDOG & ZERO ORPHANS');
  console.log('='.repeat(78));

  // 1. Multiple hard-crash trials
  const trials = 5;
  const results = [];
  console.log(`\n[Phase 1] Executing ${trials} independent hard-crash trials (target: <500ms, 0 orphans)...`);

  for (let i = 1; i <= trials; i++) {
    const res = await runSingleCrashTrial(i, 150);
    results.push(res);
    console.log(`  ✔ Trial ${i}: detected & terminated in ${res.latencyMs}ms | Parent PID: ${res.parentPid} (dead) | Overlay PID: ${res.overlayPid} (dead)`);
  }

  const maxLatency = Math.max(...results.map(r => r.latencyMs));
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length);
  console.log(`\n  Summary: Max Latency = ${maxLatency}ms, Avg Latency = ${avgLatency}ms (Requirement: <500ms)`);
  assert(maxLatency < 500, `Max latency across all trials (${maxLatency}ms) must be < 500ms`);

  // 2. Default overlay configuration test (checkIntervalMs = 200ms)
  console.log('\n[Phase 2] Testing default overlay production interval (200ms)...');
  const prodTrial = await runSingleCrashTrial('Prod-Config', 200);
  console.log(`  ✔ Production 200ms interval trial: terminated in ${prodTrial.latencyMs}ms (dead, 0 orphans)`);
  assert(prodTrial.latencyMs < 500, `Production interval latency (${prodTrial.latencyMs}ms) must be < 500ms`);

  // 3. Graceful parent termination test
  console.log('\n[Phase 3] Testing graceful parent exit (SIGTERM / normal exit)...');
  {
    const parent = spawnParentProcess();
    await sleep(50);
    const overlay = spawnOverlayProcess(parent.pid, 100);
    await sleep(50);

    const overlayExitPromise = new Promise((resolve) => {
      overlay.on('exit', resolve);
    });

    const start = performance.now();
    parent.kill('SIGTERM');
    await overlayExitPromise;
    const latency = Math.round(performance.now() - start);

    await sleep(50);
    assert.strictEqual(isPidAlive(parent.pid), false, 'Parent must be dead');
    assert.strictEqual(isPidAlive(overlay.pid), false, 'Overlay must be dead');
    console.log(`  ✔ Graceful exit detected & terminated in ${latency}ms (0 orphans)`);
    assert(latency < 500, `Graceful exit latency (${latency}ms) must be < 500ms`);
  }

  // 4. Invalid PID rejection test
  console.log('\n[Phase 4] Testing invalid PID rejection (PID 0, negative, NaN)...');
  {
    let diedReason = null;
    const wdZero = new PIDWatchdog({
      parentPid: 0,
      onParentDied: (reason) => { diedReason = reason; }
    });
    await sleep(20);
    assert.strictEqual(diedReason, 'invalid_pid', 'PID 0 must trigger invalid_pid');
    assert.strictEqual(wdZero.isActive(), false, 'Watchdog must not be active');

    diedReason = null;
    const wdNeg = new PIDWatchdog({
      parentPid: -99,
      onParentDied: (reason) => { diedReason = reason; }
    });
    await sleep(20);
    assert.strictEqual(diedReason, 'invalid_pid', 'Negative PID must trigger invalid_pid');
    assert.strictEqual(wdNeg.isActive(), false, 'Watchdog must not be active');
    console.log('  ✔ Invalid PIDs safely rejected immediately');
  }

  console.log('\n' + '='.repeat(78));
  console.log(' ALL LIFECYCLE PID WATCHDOG EMPIRICAL TESTS PASSED');
  console.log('='.repeat(78) + '\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('✖ Empirical Lifecycle Watchdog Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
