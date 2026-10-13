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
      if (desk.toLowerCase().includes('exebox')) {
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

function findRootAntigravityPid() {
  if (process.platform !== 'win32') {
    return null;
  }

  for (const exeName of ['Antigravity.exe', 'Antigravity IDE.exe']) {
    try {
      const out = child_process.execSync(`tasklist /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 1500,
      });
      const lines = out.split('\n');
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const namePart = parts[0].replace(/["']/g, '').trim().toLowerCase();
          if (namePart.includes('antigravity')) {
            const pid = parseInt(parts[1].replace(/["']/g, '').trim(), 10);
            if (Number.isFinite(pid) && pid > 0) {
              return pid;
            }
          }
        }
      }
    } catch (_e) {}
  }

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
  if (activeOverlayProcess && !activeOverlayProcess.killed) {
    log(`Terminating overlay process PID ${activeOverlayProcess.pid}`);
    try {
      activeOverlayProcess.kill('SIGTERM');
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

function checkCycle() {
  try {
    const agPid = findRootAntigravityPid();

    if (agPid) {
      // Antigravity is running
      if (!isOverlayProcessRunning()) {
        log(`Antigravity detected (PID ${agPid}), launching pet...`);
        spawnOverlay(agPid);
      } else if (currentAgPid && currentAgPid !== agPid) {
        log(`Antigravity PID changed from ${currentAgPid} to ${agPid}, restarting overlay...`);
        killOverlay();
        spawnOverlay(agPid);
      }
    } else {
      // Antigravity is NOT running
      if (isOverlayProcessRunning() || activeOverlayProcess) {
        log('Antigravity closed, stopping pet overlay...');
        killOverlay();
      }
    }
  } catch (err) {
    log(`Supervisor check cycle error: ${err.message}`);
  }
}

function startSupervisor() {
  log('Starting AG Pet background supervisor loop...');
  setInterval(checkCycle, 1500);
  checkCycle();
}

process.on('SIGINT', () => {
  log('Service received SIGINT, stopping overlay and exiting...');
  killOverlay();
  try { lockServer.close(); } catch (_e) {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Service received SIGTERM, stopping overlay and exiting...');
  killOverlay();
  try { lockServer.close(); } catch (_e) {}
  process.exit(0);
});
