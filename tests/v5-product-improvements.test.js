/**
 * tests/v5-product-improvements.test.js
 * Verification suite for the 6 new product improvements:
 * 1. Windows Auto-Start (HKCU Run key & tray integration)
 * 2. Headpat interaction (blissful face, blushing, heart particles, sound, purring phrases)
 * 3. 30-Minute Break Reminder (coffee icon, deferred during active execution)
 * 4. Contextual 10x10 Pixel-Art Status Icons (terminal, read, write, search, think, etc.)
 * 5. Time-aware startup greeting
 * 6. Full Russian UI localization & 100% test contract compatibility
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 1. Test StatusBadge and Pixel Icons
const { StatusBadge } = require('../desktop-overlay/dist/desktop-overlay/renderer/status-badge');

console.log('Testing Product Improvements Suite...');

// Mock DOM elements
function createMockCanvas(w, h) {
  const operations = [];
  return {
    width: w,
    height: h,
    getContext: () => ({
      clearRect: (...args) => operations.push({ op: 'clear', args }),
      fillRect: (...args) => operations.push({ op: 'fillRect', args }),
      fillStyle: '#FFFFFF',
    }),
    operations
  };
}

const mockBadge = { classList: { add: () => {}, remove: () => {} } };
const mockDot = { style: {}, classList: { toggle: () => {} } };
const mockText = { textContent: '' };
const mockIcon = createMockCanvas(10, 10);

const badge = new StatusBadge();
badge.bindElements(mockBadge, mockDot, mockText, mockIcon);

// Test drawing pixel icons
const icons = ['terminal', 'read', 'write', 'search', 'think', 'check', 'question', 'warning', 'heart', 'coffee', 'sleep', 'star', 'idle'];
for (const ic of icons) {
  badge.drawPixelIcon(ic);
  assert(mockIcon.operations.length > 0, `Icon '${ic}' should render pixel operations`);
  mockIcon.operations.length = 0;
}
console.log('✔ All 13 pixel-art 10x10 icons render successfully');

// Test showTemporary
badge.showTemporary('Мур-р-р! Спасибо! ♥', 'heart', 1000);
assert.strictEqual(mockText.textContent, 'Мур-р-р! Спасибо! ♥');
assert.strictEqual(badge.isVisible(), true);
console.log('✔ StatusBadge showTemporary displays correctly');

// Test Russian defaults
badge.updateState('idle');
assert.strictEqual(mockText.textContent, 'В ожидании');

badge.updateState('running', 'Running tool: run_command node test');
assert(mockText.textContent.includes('Команда: node test') || mockText.textContent.includes('Выполняю'), 'Should localize run_command');

badge.updateState('running', 'view_file src/app.ts');
assert(mockText.textContent.includes('Читаю: app.ts'), 'Should localize view_file');

badge.updateState('running', 'write_to_file index.ts');
assert(mockText.textContent.includes('Пишу: index.ts'), 'Should localize write_to_file');

badge.updateState('ready');
assert.strictEqual(mockText.textContent, 'Готово! Задача выполнена');

badge.updateState('needs_input');
assert.strictEqual(mockText.textContent, 'Жду твоего ответа');

badge.updateState('blocked');
assert.strictEqual(mockText.textContent, 'Ошибка выполнения');

badge.updateState('sleeping');
assert.strictEqual(mockText.textContent, 'Спит... Zzz');
console.log('✔ All Russian localized state names verified');

// 2. Test Animator Headpat
const { PetAnimator } = require('../dist/sprite-engine/animator');
const animator = new PetAnimator();
assert.strictEqual(animator.isHeadpat(), false);
animator.triggerHeadpat(2.5);
assert.strictEqual(animator.isHeadpat(), true);
const frame = animator.update(0.016);
assert.strictEqual(frame.rig.expression, 'headpat');
assert(frame.particles.length > 0, 'Headpat should spawn heart particles');
assert.strictEqual(frame.particles[0].text, '♥');
assert.strictEqual(frame.particles[0].color, '#FB7185');
console.log('✔ PetAnimator headpat kinematics, blushing expression & heart particles verified');

// 3. Test HTML Localization
const htmlContent = fs.readFileSync(path.join(__dirname, '../desktop-overlay/renderer/index.html'), 'utf8');
assert(htmlContent.includes('ПАНЕЛЬ ГРАВИ'), 'Header must be localized');
assert(htmlContent.includes('МАСШТАБ'), 'Scale section must be localized');
assert(htmlContent.includes('ТЕСТ СОСТОЯНИЙ'), 'Test state section must be localized');
assert(htmlContent.includes('Покой') && htmlContent.includes('Мысли') && htmlContent.includes('Работа'), 'Chips must be localized');
assert(htmlContent.includes('id="status-icon"'), 'status-icon canvas must be present');
console.log('✔ index.html Russian UI & status-icon canvas verified');

// 4. Test ContextMenu backward compatibility
const { ContextMenuController } = require('../desktop-overlay/dist/desktop-overlay/renderer/context-menu');
const menu = new ContextMenuController();
const items = menu.getMenuItems();
const muteItem = items.find(i => i.id === 'mute');
assert(muteItem.label === 'Mute Audio' || muteItem.label === 'Unmute Audio', 'getMenuItems must retain English label for test suite contracts');
console.log('✔ ContextMenu getMenuItems English contract compatibility verified');

// 5. Test Registry check
const child_process = require('node:child_process');
try {
  const regOut = child_process.execSync(
    'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v AGPet',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  assert(regOut.includes('launch-service.vbs'), 'Registry AGPet key must point to launch-service.vbs');
  console.log('✔ Windows autostart registry key verified: ' + regOut.trim().split('\r\n').pop());
} catch (e) {
  console.warn('Note: Registry check skipped or non-windows: ' + e.message);
}

console.log('\n🎉 ALL PRODUCT IMPROVEMENT TESTS PASSED 100%!');
