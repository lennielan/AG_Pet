/**
 * scripts/ag-pet-service.js
 * Persistent background supervisor for AG Pet.
 *
 * Automatically monitors both Antigravity standalone (Antigravity.exe)
 * and Antigravity IDE (Antigravity IDE.exe).
 * - Spawns the AG Pet overlay whenever Antigravity is opened.
 * - Terminates the overlay when Antigravity closes.
 * - Maintains zero orphaned processes.
 * - Uses TCP singleton lock to prevent multiple instances.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const child_process = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ELECTRON_EXE = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const APP_DIR = path.join(PROJECT_ROOT, 'desktop-overlay');
const LOG_FILE = path.join(PROJECT_ROOT, 'service-debug.log');
const APPDATA_LOG = 'C:\\Users\\lennielan\\AppData\\Roaming\\ag-pet\\service.log';
const LOCK_PORT = 38473;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (_e) {}
  try {
    fs.appendFileSync(APPDATA_LOG, line);
  } catch (_e) {}
}

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.stack || err.message || err}`);
});

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason?.stack || reason?.message || reason}`);
});

// Only run on the interactive user desktop (WinSta0\Default)
if (process.platform === 'win32') {
  try {
    const checkScript = path.join(PROJECT_ROOT, 'scripts', 'check-winsta.ps1');
    if (fs.existsSync(checkScript)) {
      const desk = child_process.execSync(
        `powershell -ExecutionPolicy Bypass -File "${checkScript}"`,
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      log(`Supervisor running on desktop: ${desk}`);
      if (desk.toLowerCase().includes('exebox') && !process.env.AG_PET_FORCE_SERVICE && !process.argv.includes('--force')) {
        log(`Refusing to run on isolated runner desktop (${desk}). Exiting so interactive desktop can bind.`);
        process.exit(0);
      }
    }
  } catch (_e) {}
}

// Singleton instance lock via loopback port
const lockServer = net.createServer();
lockServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`Another AG Pet supervisor is already active on port ${LOCK_PORT}. Exiting cleanly.`);
    process.exit(0);
  } else {
    log(`Lock server error: ${err.message}`);
  }
});

lockServer.listen(LOCK_PORT, '127.0.0.1', () => {
  log(`Acquired supervisor singleton lock on 127.0.0.1:${LOCK_PORT}`);
  startSupervisor();
});

let activeOverlayProcess = null;
let currentAgPid = null;
let dismissedForAgPid = null;

function findRootAntigravityPid() {
  if (process.platform !== 'win32') {
    return null;
  }

  for (const exeName of ['Antigravity.exe', 'Antigravity IDE.exe']) {
    try {
      const out = child_process.execSync(`tasklist /V /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 2000,
      });
      const lines = out.split('\n');
      for (const line of lines) {
        if (!line.includes(exeName)) continue;
        const parts = line.split('","').map((p) => p.replace(/"/g, '').trim());
        if (parts.length >= 9) {
          const pid = parseInt(parts[1], 10);
          const title = parts[8];
          if (Number.isFinite(pid) && pid > 0 && title && title !== 'N/A' && title !== 'OleMainThreadWndName') {
            return pid;
          }
        }
      }
    } catch (_e) {}
  }

  try {
    const psCmd = `powershell -NoProfile -NonInteractive -Command "$p = Get-Process -Name 'Antigravity','Antigravity IDE' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { $p.Id }"`;
    const out = child_process.execSync(psCmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 2000,
    }).trim();
    const pid = parseInt(out, 10);
    if (Number.isFinite(pid) && pid > 0) return pid;
  } catch (_e) {}

  return null;
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function isOverlayProcessRunning() {
  if (activeOverlayProcess && !activeOverlayProcess.killed) {
    if (isPidAlive(activeOverlayProcess.pid)) {
      return true;
    }
  }
  return false;
}

function spawnOverlay(agPid) {
  log(`Spawning AG Pet overlay attached to Antigravity PID ${agPid}...`);
  if (!fs.existsSync(ELECTRON_EXE)) {
    log(`ERROR: Electron binary not found at ${ELECTRON_EXE}`);
    return;
  }

  try {
    const child = child_process.spawn(
      ELECTRON_EXE,
      [APP_DIR, `--parent-pid=${agPid}`, '--mode=overlay'],
      {
        cwd: PROJECT_ROOT,
        detached: false,
        stdio: 'ignore',
        env: {
          ...process.env,
          AG_PET_PARENT_PID: String(agPid),
        },
      }
    );

    child.on('exit', (code, signal) => {
      log(`Overlay process PID ${child.pid} exited (code: ${code}, signal: ${signal})`);
      if (activeOverlayProcess === child) {
        activeOverlayProcess = null;
      }
      // If Antigravity is still running with an active window, but the pet was closed,
      // it means the user closed the pet intentionally (Task Manager or Tray Exit).
      // Mark it as dismissed for this Antigravity session so we don't respawn it in a loop!
      if (currentAgPid && isPidAlive(currentAgPid)) {
        log(`Pet was dismissed/killed while Antigravity (${currentAgPid}) is still active. Suppressing respawn.`);
        dismissedForAgPid = currentAgPid;
      }
    });

    child.on('error', (err) => {
      log(`Overlay process spawn error: ${err.message}`);
      if (activeOverlayProcess === child) {
        activeOverlayProcess = null;
      }
    });

    activeOverlayProcess = child;
    currentAgPid = agPid;
    log(`Overlay process successfully spawned with PID ${child.pid}`);
  } catch (err) {
    log(`Failed to spawn overlay: ${err.message}`);
  }
}

function killOverlay() {
  if (activeOverlayProcess) {
    const pid = activeOverlayProcess.pid;
    log(`Terminating overlay process PID ${pid}`);
    try {
      activeOverlayProcess.kill('SIGTERM');
      if (process.platform === 'win32' && pid) {
        try {
          child_process.execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        } catch (_e) {}
      }
      setTimeout(() => {
        if (activeOverlayProcess && !activeOverlayProcess.killed) {
          try {
            activeOverlayProcess.kill('SIGKILL');
          } catch (_e) {}
        }
      }, 500);
    } catch (_e) {}
    activeOverlayProcess = null;
  }
  currentAgPid = null;
}

let lastWindowCheckTime = 0;
let isCheckingWindowAsync = false;
let checkTimer = null;

function checkWindowVisibleAsync(pid, callback) {
  if (process.platform !== 'win32') {
    return callback(true);
  }
  const psCmd = `powershell -NoProfile -NonInteractive -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { 'VIS' }"`;
  child_process.exec(psCmd, { windowsHide: true, timeout: 3000 }, (err, stdout) => {
    if (err) {
      return callback(isPidAlive(pid));
    }
    const isVis = stdout && stdout.includes('VIS');
    callback(Boolean(isVis));
  });
}

function scheduleNextCheck(delayMs) {
  if (checkTimer) {
    clearTimeout(checkTimer);
  }
  checkTimer = setTimeout(checkCycle, delayMs);
}

function checkCycle() {
  try {
    const now = Date.now();

    // 1. Antigravity PID is already known
    if (currentAgPid) {
      const alive = isPidAlive(currentAgPid);
      if (!alive) {
        log(`Antigravity PID ${currentAgPid} exited (detected via isPidAlive). Stopping overlay.`);
        currentAgPid = null;
        dismissedForAgPid = null;
        if (isOverlayProcessRunning() || activeOverlayProcess) {
          killOverlay();
        }
        scheduleNextCheck(4000);
        return;
      }

      // Check window visibility at most once every 10 seconds asynchronously
      if (now - lastWindowCheckTime >= 10000 && !isCheckingWindowAsync) {
        lastWindowCheckTime = now;
        isCheckingWindowAsync = true;
        checkWindowVisibleAsync(currentAgPid, (hasVisibleWindow) => {
          isCheckingWindowAsync = false;
          if (!hasVisibleWindow) {
            log(`Antigravity PID ${currentAgPid} main window closed. Terminating overlay.`);
            dismissedForAgPid = null;
            killOverlay();
            currentAgPid = null;
          }
        });
      }

      // Verify overlay is still running (if user didn't dismiss it)
      if (currentAgPid !== dismissedForAgPid) {
        if (!isOverlayProcessRunning()) {
          log(`Overlay died while Antigravity (${currentAgPid}) is active. Relaunching pet...`);
          spawnOverlay(currentAgPid);
        }
      }

      scheduleNextCheck(2000);
      return;
    }

    // 2. Antigravity PID not known: search for root Antigravity process
    const agPid = findRootAntigravityPid();

    if (agPid) {
      currentAgPid = agPid;
      lastWindowCheckTime = now;
      if (agPid !== dismissedForAgPid) {
        if (!isOverlayProcessRunning()) {
          log(`Antigravity detected (PID ${agPid}), launching pet...`);
          spawnOverlay(agPid);
        }
      }
      scheduleNextCheck(2000);
    } else {
      dismissedForAgPid = null;
      if (isOverlayProcessRunning() || activeOverlayProcess) {
        log('Antigravity closed, stopping pet overlay...');
        killOverlay();
      }
      scheduleNextCheck(4000);
    }
  } catch (err) {
    log(`Supervisor check cycle error: ${err.message}`);
    scheduleNextCheck(4000);
  }
}

function startSupervisor() {
  log('Starting AG Pet background supervisor loop...');
  checkCycle();
}

process.on('SIGINT', () => {
  if (checkTimer) clearTimeout(checkTimer);
  log('Service received SIGINT, stopping overlay and exiting...');
  killOverlay();
  try { lockServer.close(); } catch (_e) {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (checkTimer) clearTimeout(checkTimer);
  log('Service received SIGTERM, stopping overlay and exiting...');
  killOverlay();
  try { lockServer.close(); } catch (_e) {}
  process.exit(0);
});
