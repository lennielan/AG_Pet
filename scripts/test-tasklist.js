const { execSync } = require('child_process');

for (const exeName of ['Antigravity.exe', 'Antigravity IDE.exe']) {
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`, { encoding: 'utf8' });
    console.log('OUTPUT for', exeName, ':\n', out);
    const lines = out.split('\n');
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const namePart = parts[0].replace(/["']/g, '').trim().toLowerCase();
        if (namePart.includes('antigravity')) {
          const pid = parseInt(parts[1].replace(/["']/g, '').trim(), 10);
          console.log('FOUND PID:', pid);
        }
      }
    }
  } catch (e) {
    console.error('ERR:', e.message);
  }
}
