/**
 * workload-6-context-menu-scale-mute-relaunch.test.js
 * Tier 4 Workload 6: Context Menu Customization & Relaunch
 * Scale 2x, Mute audio surviving state changes and relaunch.
 */

const assert = require('node:assert');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');
const { PixelValidator } = TestHarness;

module.exports = {
  name: 'Workload 6: Context Menu Customization & Relaunch',
  tier: 4,
  tests: [
    {
      name: 'test_scale_and_mute_customization_across_relaunch',
      fn: async () => {
        const harness = new TestHarness('Workload 6');
        const tmpDir = harness.createTempDir('custom-menu-');
        const configPath = path.join(tmpDir, 'config.json');

        // Session 1: User customizes scale to 2.0x and mutes audio
        const petConfig = { x: 300, y: 250, scale: 2.0, isMuted: true };
        const audio = TestHarness.createAudioSynthModel(petConfig.isMuted);
        const sm = TestHarness.createAnimationStateMachine('idle');

        // Run turn cycle under 2x scale and mute
        sm.transitionTo('running', 'Active task');
        const soundRunning = audio.playSound('state_change');
        assert.strictEqual(soundRunning.effectiveGain, 0.0, 'Muted state suppresses audio gain');

        sm.transitionTo('ready', 'Completed');
        const soundReady = audio.playSound('ready');
        assert.strictEqual(soundReady.effectiveGain, 0.0);

        // Save customized config
        const dragModel = TestHarness.createDragPersistModel(petConfig);
        dragModel.endDrag(configPath);

        // Session 2: Relaunch overlay with saved configuration
        const session2 = TestHarness.createDragPersistModel({ x: 0, y: 0, scale: 1.0, isMuted: false });
        const restored = session2.loadConfig(configPath);

        assert.strictEqual(restored.scale, 2.0, 'Scale 2.0x restored after relaunch');
        assert.strictEqual(restored.isMuted, true, 'Mute setting restored after relaunch');

        // Verify 2x rendered pixel matrix (64x64)
        const canonical = PixelValidator.generateCanonicalReferenceSprite();
        const scaled2x = PixelValidator.scaleMatrix(canonical, restored.scale);
        const check2x = PixelValidator.validateCrispScaling(canonical, scaled2x, 2.0);

        assert.strictEqual(check2x.valid, true);
        assert.strictEqual(scaled2x.length, 64);
        assert.strictEqual(scaled2x[0].length, 64);

        await harness.cleanup();
      }
    }
  ]
};
