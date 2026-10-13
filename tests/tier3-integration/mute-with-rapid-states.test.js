/**
 * mute-with-rapid-states.test.js
 * Tier 3 Pairwise: F04 (Mute Audio) × F02/F14 (Rapid State Streaming)
 * Validates audio gain suppression during rapid state transitions.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Mute with Rapid States',
  tier: 3,
  tests: [
    {
      name: 'test_mute_toggle_with_streaming_states',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(false);
        const states = ['running', 'needs_input', 'running', 'ready', 'blocked'];

        // Initial unmuted sound
        const s1 = audio.playSound('state_change');
        assert.strictEqual(s1.effectiveGain, 0.3);

        // Mute audio
        audio.setMuted(true);

        // Stream remaining states
        for (const st of states) {
          const soundKey = st === 'ready' ? 'ready' : (st === 'blocked' ? 'blocked' : 'state_change');
          const res = audio.playSound(soundKey);
          assert.strictEqual(res.effectiveGain, 0.0, `State ${st} must be silent while muted`);
        }

        // Unmute and fire celebration
        audio.setMuted(false);
        const finalSound = audio.playSound('ready');
        assert.strictEqual(finalSound.effectiveGain, 0.3);
      }
    }
  ]
};
