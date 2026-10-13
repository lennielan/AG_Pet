/**
 * audio-unmute-ready-chime.test.js
 * Tier 3 Pairwise: F04 (Audio Synth) × F02 (Ready State)
 * Validates audio unmuting just before ready celebration triggers chime.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Audio Unmute Ready Chime',
  tier: 3,
  tests: [
    {
      name: 'test_unmute_triggers_audible_celebration_chime',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(true); // muted
        const sm = TestHarness.createAnimationStateMachine('running');

        // Silent tool sounds while muted
        const s1 = audio.playSound('state_change');
        assert.strictEqual(s1.effectiveGain, 0.0);

        // User unmutes via context menu
        audio.setMuted(false);

        // Agent finishes task
        sm.transitionTo('ready', 'Task complete');
        const sReady = audio.playSound('ready');

        assert.strictEqual(sReady.effectiveGain, 0.3, 'Ready celebration must be audible after unmuting');
        assert(sReady.preset.chord.length >= 3, 'Must play full celebration arpeggio');
      }
    }
  ]
};
