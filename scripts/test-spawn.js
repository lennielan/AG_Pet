const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ELECTRON_EXE = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const APP_DIR = path.join(PROJECT_ROOT, 'desktop-overlay');

console.log('ELECTRON_EXE exists:', fs.existsSync(ELECTRON_EXE));
console.log('APP_DIR exists:', fs.existsSync(APP_DIR));

const child = child_process.spawn(
  ELECTRON_EXE,
  [APP_DIR, '--parent-pid=17284', '--mode=overlay'],
  {
    cwd: PROJECT_ROOT,
    detached: false,
    stdio: 'inherit',
    env: {
      ...process.env,
      AG_PET_PARENT_PID: '17284',
    },
  }
);

console.log('Spawned child PID:', child.pid);

child.on('exit', (code, signal) => {
  console.log('Child exited with code:', code, 'signal:', signal);
});

child.on('error', (err) => {
  console.error('Child error:', err);
});
