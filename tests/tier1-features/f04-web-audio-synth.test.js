/**
 * f04-web-audio-synth.test.js
 * Feature 4: Web Audio Retro Synth & Mute
 * Validates audio presets, default gain, mute attenuation to 0, toggle, and frequencies.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

module.exports = {
  name: 'F04: Web Audio Retro Synth & Mute',
  tier: 1,
  tests: [
    {
      name: 'test_audio_presets_defined',
      fn: async () => {
        const requiredPresets = ['state_change', 'ready', 'blocked', 'needs_input', 'wave'];
        for (const preset of requiredPresets) {
          assert(contracts.AUDIO_PRESETS[preset] !== undefined, `Audio preset ${preset} must be defined`);
        }
      }
    },
    {
      name: 'test_unmuted_gain_level',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(false);
        assert.strictEqual(audio.isMuted(), false);
        const played = audio.playSound('state_change');
        assert.strictEqual(played.effectiveGain, 0.3, 'Default audible gain must be 0.3');
      }
    },
    {
      name: 'test_mute_silences_gain',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(true);
        assert.strictEqual(audio.isMuted(), true);
        const played = audio.playSound('ready');
        assert.strictEqual(played.effectiveGain, 0.0, 'When muted, effective gain must be strictly 0.0');
      }
    },
    {
      name: 'test_mute_toggle_idempotence',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(false);
        assert.strictEqual(audio.toggleMute(), true);
        assert.strictEqual(audio.isMuted(), true);
        assert.strictEqual(audio.toggleMute(), false);
        assert.strictEqual(audio.isMuted(), false);
      }
    },
    {
      name: 'test_frequency_ranges_retro_synth',
      fn: async () => {
        const readyPreset = contracts.AUDIO_PRESETS.ready;
        const blockedPreset = contracts.AUDIO_PRESETS.blocked;

        // Ready preset uses ascending cheerful chord
        assert(Array.isArray(readyPreset.chord), 'Ready sound should have chord frequencies');
        assert(readyPreset.chord[0] >= 500, 'Ready chord should start above 500Hz');
        assert(readyPreset.chord[readyPreset.chord.length - 1] > readyPreset.chord[0], 'Chord must be ascending');

        // Blocked preset uses low retro descending buzz
        assert(blockedPreset.startFreq > blockedPreset.endFreq, 'Blocked sound should be descending');
        assert(blockedPreset.startFreq <= 300, 'Blocked sound frequency should be low retro buzz');
      }
    }
  ]
};
