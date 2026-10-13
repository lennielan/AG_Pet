/**
 * scripts/ag-pet-launcher.js
 * Universal launcher hook for AG Pet.
 *
 * Ensures the AG Pet overlay is spawned whenever Antigravity (standalone app)
 * or Antigravity IDE is running, attaching to the active Antigravity PID
 * so it cleanly exits when the application closes.
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENTRY_POINT = path.join(PROJECT_ROOT, 'desktop-overlay', 'dist', 'desktop-overlay', 'main', 'index.js');
const ELECTRON_EXE = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function findAntigravityPid() {
  if (process.platform !== 'win32') {
    return undefined;
  }

  // 1. Prioritize finding the root Antigravity or Antigravity IDE process without child --type= flags
  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"(name = 'Antigravity.exe' or name = 'Antigravity IDE.exe')\\" | Where-Object { \\$_.CommandLine -notmatch '--type=' } | Select-Object -ExpandProperty ProcessId -First 1"`;
    const out = child_process.execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    const pid = parseInt(out, 10);
    if (Number.isFinite(pid) && pid > 0) {
      return pid;
    }
  } catch (_e) {}

  // 2. Fallback to tasklist matching
  try {
    const output = child_process.execSync('tasklist /NH /FO CSV', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });

    const lines = output.split('\n');
    for (const line of lines) {
      if (/antigravity/i.test(line)) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const pidStr = parts[1].replace(/["']/g, '').trim();
          const pid = parseInt(pidStr, 10);
          if (Number.isFinite(pid) && pid > 0) {
            return pid;
          }
        }
      }
    }
  } catch (_e) {}

  return undefined;
}

function isOverlayAlreadyRunning() {
  try {
    const output = child_process.execSync('tasklist /NH /FO CSV', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /electron/i.test(output);
  } catch (_e) {
    return false;
  }
}

function launchOverlay() {
  if (isOverlayAlreadyRunning()) {
    console.log('[ag-pet-launcher] Overlay is already running.');
    return;
  }

  const agPid = findAntigravityPid() || process.ppid || process.pid;
  console.log(`[ag-pet-launcher] Attaching to Antigravity PID: ${agPid}`);

  if (!fs.existsSync(ELECTRON_EXE)) {
    console.warn(`[ag-pet-launcher] Electron binary not found at ${ELECTRON_EXE}`);
    return;
  }

  if (process.platform === 'win32') {
    const overlayDir = path.join(PROJECT_ROOT, 'desktop-overlay');
    const psCmd = `Start-Process -FilePath '${ELECTRON_EXE}' -ArgumentList '${overlayDir}', '--parent-pid=${agPid}', '--mode=overlay'`;
    try {
      child_process.execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore' });
      console.log(`[ag-pet-launcher] AG Pet overlay successfully launched attached to Antigravity (PID ${agPid}).`);
    } catch (err) {
      console.error('[ag-pet-launcher] Launch error:', err.message);
    }
  } else {
    const child = child_process.spawn(ELECTRON_EXE, [ENTRY_POINT, `--parent-pid=${agPid}`, '--mode=overlay'], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }
}

if (require.main === module) {
  try {
    launchOverlay();
  } catch (err) {
    console.error('[ag-pet-launcher] Error:', err.message);
  }
}

module.exports = {
  findAntigravityPid,
  isOverlayAlreadyRunning,
  launchOverlay,
  isPidAlive,
};
