/**
 * tests/interactive-bottom-dock.test.js
 * Verification suite for the Interactive Dynamic Bottom Dock & Gaze Tracking.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PetAnimator } = require('../desktop-overlay/dist/sprite-engine/animator');
const { PetEngine } = require('../desktop-overlay/dist/sprite-engine/index');
const { calculateWindowDimensions } = require('../desktop-overlay/dist/desktop-overlay/main/index');
const { PetOverlayRendererApp } = require('../desktop-overlay/dist/desktop-overlay/renderer/app');

console.log('Testing Interactive Dynamic Bottom Dock Suite...');

// 1. Verify HTML Structure
const htmlPath = path.resolve(__dirname, '../desktop-overlay/renderer/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
assert(htmlContent.includes('id="dock-hover-bridge"'), 'index.html must contain #dock-hover-bridge');
assert(htmlContent.includes('id="bottom-dock"'), 'index.html must contain #bottom-dock');
assert(htmlContent.includes('id="dock-write-btn"'), 'index.html must contain #dock-write-btn');
assert(htmlContent.includes('id="dock-composer"'), 'index.html must contain #dock-composer');
assert(htmlContent.includes('id="dock-input"'), 'index.html must contain #dock-input');
assert(htmlContent.includes('id="dock-send-btn"'), 'index.html must contain #dock-send-btn');
assert(!htmlContent.includes('title="'), 'Strict Anti-AI: index.html must not use intrusive native title tooltips');
console.log('✔ HTML markup & structure verified');

// 2. Verify CSS Styling & Anti-AI Design
const cssPath = path.resolve(__dirname, '../desktop-overlay/renderer/style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
assert(cssContent.includes('.bottom-dock'), 'style.css must define .bottom-dock');
assert(cssContent.includes('.bottom-dock.state-line'), 'style.css must define .state-line');
assert(cssContent.includes('.bottom-dock.state-hover'), 'style.css must define .state-hover');
assert(cssContent.includes('.bottom-dock.state-expanded'), 'style.css must define .state-expanded');
assert(cssContent.includes('.bottom-dock.state-sending'), 'style.css must define .state-sending');
assert(cssContent.includes('#0B0D14'), 'style.css must use obsidian #0B0D14 base background');
assert(cssContent.includes('cubic-bezier(0.22, 1, 0.36, 1)'), 'style.css must use spring cubic-bezier timing');
console.log('✔ CSS obsidian palette and motion phases verified');

// 3. Verify PetAnimator Gaze Tracking Kinematics
const animator = new PetAnimator('idle');
animator.update(0.05);

// Test neutral gaze
const initialRig = animator.getRigPose();
assert(typeof initialRig.lookX === 'number', 'lookX must be a number');
assert(typeof initialRig.lookY === 'number', 'lookY must be a number');

// Activate composing gaze at start (progress = 0)
animator.setComposingState(true, 0);
assert.strictEqual(animator.getComposingState().isComposing, true);
assert.strictEqual(animator.getComposingState().progress, 0);

// Advance 500ms to allow exponential lerp convergence
for (let i = 0; i < 20; i++) {
  animator.update(0.025);
}
const composingStartRig = animator.getRigPose();
assert(composingStartRig.lookY > 1.2, `lookY must look downward towards dock (>1.2), got ${composingStartRig.lookY}`);
assert(composingStartRig.lookX < -1.5, `lookX must look leftward (<-1.5) at start of text, got ${composingStartRig.lookX}`);

// Shift gaze to end of text (progress = 1.0)
animator.setComposingState(true, 1.0);
assert.strictEqual(animator.getComposingState().progress, 1.0);
for (let i = 0; i < 20; i++) {
  animator.update(0.025);
}
const composingEndRig = animator.getRigPose();
assert(composingEndRig.lookY > 1.2, `lookY must stay focused downward (>1.2), got ${composingEndRig.lookY}`);
assert(composingEndRig.lookX > 1.5, `lookX must slide rightward (>1.5) tracking text completion, got ${composingEndRig.lookX}`);

// Deactivate composing
animator.setComposingState(false, 0);
assert.strictEqual(animator.getComposingState().isComposing, false);
for (let i = 0; i < 30; i++) {
  animator.update(0.025);
}
const neutralRig = animator.getRigPose();
assert(Math.abs(neutralRig.lookY) < 1.0, `lookY must smoothly return toward neutral, got ${neutralRig.lookY}`);
console.log('✔ PetAnimator gaze tracking & continuous eye kinematics verified');

// 4. Verify PetEngine Facade Composing API
const mockCanvas = {
  getContext: () => null,
  style: {},
  width: 64,
  height: 64,
};
const engine = new PetEngine(mockCanvas);
assert(typeof engine.setComposingState === 'function', 'PetEngine must expose setComposingState');
assert(typeof engine.getComposingState === 'function', 'PetEngine must expose getComposingState');
engine.setComposingState(true, 0.42);
assert.strictEqual(engine.getComposingState().isComposing, true);
assert.strictEqual(engine.getComposingState().progress, 0.42);
engine.dispose();
console.log('✔ PetEngine composing facade verified');

// 5. Verify Window Dimensions (Expanded for Dock Room)
const dims10 = calculateWindowDimensions(1.0);
assert(dims10.width >= 320, `Width at 1.0x must be >= 320, got ${dims10.width}`);
assert(dims10.height >= 360, `Height at 1.0x must be >= 360 for bottom dock comfort, got ${dims10.height}`);

const dims15 = calculateWindowDimensions(1.5);
assert(dims15.height >= 360, `Height at 1.5x must be >= 360, got ${dims15.height}`);

const dims20 = calculateWindowDimensions(2.0);
assert(dims20.height >= 396, `Height at 2.0x must accommodate large scale, got ${dims20.height}`);
console.log('✔ Window dimension calculation with dock clearance verified');

// 6. Verify Renderer App Dock Controller & Headless Resilience
const app = new PetOverlayRendererApp(mockCanvas);
assert.strictEqual(app.getDockState(), 'line');

app.setDockState('hover');
assert.strictEqual(app.getDockState(), 'hover');

app.expandDock();
assert.strictEqual(app.getDockState(), 'expanded');
assert.strictEqual(app.getPetEngine().getComposingState().isComposing, true);

app.collapseDock();
assert.strictEqual(app.getDockState(), 'line');
assert.strictEqual(app.getPetEngine().getComposingState().isComposing, false);

app.stop();
console.log('✔ PetOverlayRendererApp dock state machine verified');

console.log('\n🎉 ALL INTERACTIVE BOTTOM DOCK TESTS PASSED 100%!\n');
