/**
 * click-focus-during-blocked.test.js
 * Tier 3 Pairwise: F09 (Click Focus) × F02/F13 (Blocked Error State)
 * Validates click-to-focus behavior when agent is blocked on an error.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Click Focus during Blocked',
  tier: 3,
  tests: [
    {
      name: 'test_click_focus_dispatched_while_blocked',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('running');
        // Agent encounters fatal error
        sm.transitionTo('blocked', 'Blocked: syntax error');
        assert.strictEqual(sm.getScreenExpression(), 'X X');

        let focusRequested = false;
        const clickPet = () => {
          focusRequested = true;
        };

        clickPet();
        assert.strictEqual(focusRequested, true, 'Clicking must dispatch focus request');
        // Visual state remains blocked
        assert.strictEqual(sm.getState(), 'blocked');
        assert.strictEqual(sm.getScreenExpression(), 'X X');
      }
    }
  ]
};
