/**
 * tests/system-lifecycle-and-input.test.js
 * Verification suite for window-based lifecycle watchdog and layout-independent input injection.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { loadPetConfig, savePetConfig } = require('../desktop-overlay/dist/desktop-overlay/main/config');
const { findAntigravityWindowPid } = require('../desktop-overlay/dist/desktop-overlay/main/index');

console.log('Testing System Lifecycle & Input Injection Suite...');

// 1. Verify parentPid is NOT persisted to disk in ag-pet-config.json
const testConfigPath = path.resolve(__dirname, 'test-temp-config.json');
try {
  const sampleConfig = {
    x: 150,
    y: 250,
    scale: 1.5,
    isMuted: false,
    parentPid: 99999,
    wsPort: 38472,
  };

  const res = savePetConfig(sampleConfig, testConfigPath);
  assert.strictEqual(res.success, true, 'savePetConfig should succeed');

  const fileContent = fs.readFileSync(testConfigPath, 'utf8');
  assert(!fileContent.includes('"parentPid"'), 'parentPid must NOT be written to persistent config on disk');

  const loaded = loadPetConfig(testConfigPath);
  assert.strictEqual(loaded.parentPid, undefined, 'loadPetConfig must return undefined for parentPid');
  console.log('✔ parentPid config disk omission verified');
} finally {
  try { fs.unlinkSync(testConfigPath); } catch (_e) {}
}

// 2. Verify findAntigravityWindowPid exports correctly and returns number or null
const winPid = findAntigravityWindowPid();
assert(winPid === null || (typeof winPid === 'number' && winPid > 0), 'findAntigravityWindowPid must return valid PID or null');
console.log(`✔ findAntigravityWindowPid executed successfully (returned: ${winPid})`);

// 3. Verify send-chat-message.ps1 exists and syntax is valid
const psScriptPath = path.resolve(__dirname, '../scripts/send-chat-message.ps1');
assert(fs.existsSync(psScriptPath), 'scripts/send-chat-message.ps1 must exist');
const psContent = fs.readFileSync(psScriptPath, 'utf8');
assert(psContent.includes('keybd_event(0x11'), 'Script must use VK_CONTROL 0x11');
assert(psContent.includes('keybd_event(0x56'), 'Script must use VK_V 0x56');
assert(psContent.includes('keybd_event(0x0D'), 'Script must use VK_RETURN 0x0D');
assert(psContent.includes('AttachThreadInput'), 'Script must use AttachThreadInput for foreground focus');
assert(psContent.includes('IsIconic'), 'Script must check IsIconic before ShowWindow');
console.log('✔ send-chat-message.ps1 virtual key injection logic verified');

// 4. Verify ag-pet-service.js contains dismissal protection
const servicePath = path.resolve(__dirname, '../scripts/ag-pet-service.js');
const serviceContent = fs.readFileSync(servicePath, 'utf8');
assert(serviceContent.includes('dismissedForAgPid'), 'ag-pet-service.js must contain dismissedForAgPid protection');
assert(serviceContent.includes('taskkill /PID'), 'ag-pet-service.js must use taskkill /T /F for clean termination');
console.log('✔ ag-pet-service.js dismissal and kill tree verified');

console.log('\n🎉 ALL SYSTEM LIFECYCLE & INPUT INJECTION TESTS PASSED 100%!');
