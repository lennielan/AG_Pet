const cp = require('child_process');
const electron = 'D:\\Projects\\AG_Pet\\node_modules\\electron\\dist\\electron.exe';
const appDir = 'D:\\Projects\\AG_Pet\\desktop-overlay';

console.log('Starting electron process...');
const p = cp.spawn(electron, [appDir, '--parent-pid=4432'], {
  stdio: 'inherit'
});

p.on('exit', (code, sig) => {
  console.log('ELECTRON EXITED WITH CODE:', code, 'SIG:', sig);
});
