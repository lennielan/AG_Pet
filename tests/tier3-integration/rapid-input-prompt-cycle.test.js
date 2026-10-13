/**
 * rapid-input-prompt-cycle.test.js
 * Tier 3 Pairwise: F13 (Needs Input) × F02 (Expression '? ?') × F04 (Chirp Sound)
 * Validates synchronized visual and audio reaction on input prompt cycles.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Rapid Input Prompt Cycle',
  tier: 3,
  tests: [
    {
      name: 'test_synchronized_input_prompt_reactions',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('running');
        const audio = TestHarness.createAudioSynthModel(false);

        // Turn 1 prompts user
        sm.transitionTo('needs_input', 'Awaiting user input');
        const chirp1 = audio.playSound('needs_input');

        assert.strictEqual(sm.getScreenExpression(), '? ?');
        assert.strictEqual(chirp1.effectiveGain, 0.3);
        assert.deepStrictEqual(chirp1.preset.chime, [587.33, 880.00]);

        // User answers, agent resumes running
        sm.transitionTo('running', 'Executing user directive');
        audio.playSound('state_change');
        assert.strictEqual(sm.getScreenExpression(), '||||');

        // Agent prompts user again
        sm.transitionTo('needs_input', 'Confirm file overwrite?');
        const chirp2 = audio.playSound('needs_input');
        assert.strictEqual(sm.getScreenExpression(), '? ?');
        assert.strictEqual(chirp2.effectiveGain, 0.3);
      }
    }
  ]
};
