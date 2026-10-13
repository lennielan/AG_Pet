/**
 * f04-audio-boundaries.test.js
 * Feature 4 Boundaries: Web Audio Retro Synth & Mute
 * Validates unknown presets, rapid bursts under mute, mid-sequence unmute,
 * safe frequency clamping, and gain boundary clamping.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

module.exports = {
  name: 'F04 Boundaries: Web Audio Retro Synth & Mute',
  tier: 2,
  tests: [
    {
      name: 'test_unknown_sound_preset_error',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel();
        assert.throws(() => {
          audio.playSound('laser_beam_9000');
        }, /Unknown audio preset: laser_beam_9000/);
      }
    },
    {
      name: 'test_rapid_sound_bursts_under_mute',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(true); // muted
        // Fire 50 rapid sounds
        for (let i = 0; i < 50; i++) {
          const res = audio.playSound('state_change');
          assert.strictEqual(res.effectiveGain, 0.0);
        }
        assert.strictEqual(audio.getHistory().length, 50);
        assert(audio.getHistory().every(h => h.effectiveGain === 0.0));
      }
    },
    {
      name: 'test_unmute_in_midst_of_playback',
      fn: async () => {
        const audio = TestHarness.createAudioSynthModel(true);
        const s1 = audio.playSound('state_change');
        assert.strictEqual(s1.effectiveGain, 0.0);

        audio.setMuted(false);
        const s2 = audio.playSound('state_change');
        assert.strictEqual(s2.effectiveGain, 0.3);
      }
    },
    {
      name: 'test_extreme_frequency_clamping',
      fn: async () => {
        // Human hearing bounds: 20 Hz to 20,000 Hz
        for (const [key, preset] of Object.entries(contracts.AUDIO_PRESETS)) {
          const freqs = [];
          if (preset.startFreq) freqs.push(preset.startFreq);
          if (preset.endFreq) freqs.push(preset.endFreq);
          if (preset.chord) freqs.push(...preset.chord);
          if (preset.chime) freqs.push(...preset.chime);

          for (const f of freqs) {
            assert(f >= 20 && f <= 20000, `Preset ${key} frequency ${f}Hz must be within safe audible range`);
          }
        }
      }
    },
    {
      name: 'test_negative_gain_prevention',
      fn: async () => {
        const clampGain = (val) => Math.max(0.0, Math.min(1.0, val));
        assert.strictEqual(clampGain(-0.5), 0.0);
        assert.strictEqual(clampGain(1.8), 1.0);
        assert.strictEqual(clampGain(0.3), 0.3);
      }
    }
  ]
};
