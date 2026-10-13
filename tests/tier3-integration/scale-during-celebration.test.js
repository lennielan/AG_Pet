/**
 * scale-during-celebration.test.js
 * Tier 3 Pairwise: F07 (Context Menu Scale) × F02 (Ready State Celebration)
 * Validates scaling factor change while celebrating ready state.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { PixelValidator } = TestHarness;

module.exports = {
  name: 'T3 Pairwise: Scale during Celebration',
  tier: 3,
  tests: [
    {
      name: 'test_scale_switch_during_ready_celebration',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('idle');
        sm.transitionTo('ready', 'Task completed');
        assert.strictEqual(sm.getScreenExpression(), '★ ★');

        // Scale switches from 1x to 2x while in ready state
        const sprite = PixelValidator.generateCanonicalReferenceSprite();
        const scaled2x = PixelValidator.scaleMatrix(sprite, 2.0);
        const crispCheck = PixelValidator.validateCrispScaling(sprite, scaled2x, 2.0);

        assert.strictEqual(crispCheck.valid, true);
        assert.strictEqual(scaled2x.length, 64);
        assert.strictEqual(sm.getState(), 'ready');
      }
    }
  ]
};
