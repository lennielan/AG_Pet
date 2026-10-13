/**
 * scripts/ag-pet-daemon.js
 * Long-running daemon host for the AG Pet overlay.
 * Dynamically resolves Antigravity process PID and keeps the overlay running.
 */

const cp = require('child_process');
const path = require('path');
const { findAntigravityPid } = require('./ag-pet-launcher');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ELECTRON_EXE = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const APP_DIR = path.join(PROJECT_ROOT, 'desktop-overlay');

const agPid = findAntigravityPid() || 4432;
console.log(`[ag-pet-daemon] Starting AG Pet overlay attached to Antigravity PID ${agPid}...`);

const child = cp.spawn(ELECTRON_EXE, [APP_DIR, `--parent-pid=${agPid}`, '--mode=overlay'], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  console.log(`[ag-pet-daemon] Overlay exited (code: ${code}, signal: ${signal})`);
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[ag-pet-daemon] Child error:', err);
  process.exit(1);
});
