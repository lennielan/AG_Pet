/**
 * sprite-engine/audio.ts
 * Pure procedural Web Audio API synthesizer for AG Pet.
 * Generates 5 bespoke retro sci-fi sound presets with zero external audio assets,
 * master gain mute control, anti-click smoothing, and headless test-runner fallback.
 */

import { AgentState, AudioEngineOptions, SoundHistoryEntry, SoundPreset } from '../shared/types';
import { DEFAULT_IS_MUTED, DEFAULT_MASTER_VOLUME } from '../shared/constants';

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = DEFAULT_MASTER_VOLUME;
  private isHeadless = false;
  private soundHistory: SoundHistoryEntry[] = [];
  private maxHistory = 500;

  constructor(options: AudioEngineOptions & { maxHistory?: number } = {}) {
    this.muted = options.muted ?? DEFAULT_IS_MUTED;
    this.volume = options.volume ?? DEFAULT_MASTER_VOLUME;
    if (options.maxHistory !== undefined) {
      this.maxHistory = options.maxHistory;
    }

    if (options.audioContext) {
      this.ctx = options.audioContext;
      this.initMasterGain();
    } else if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      // Browser environment: AudioContext will be initialized lazily on first sound or user gesture
    } else {
      // Headless / Node.js test environment
      this.isHeadless = true;
    }
  }

  private async ensureContext(): Promise<boolean> {
    if (this.isHeadless) return false;

    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        this.isHeadless = true;
        return false;
      }
      try {
        this.ctx = new AudioCtxClass();
        this.initMasterGain();
      } catch {
        this.isHeadless = true;
        return false;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Autoplay policy prevented immediate resume; will retry on next user interaction
        return false;
      }
    }

    return this.ctx !== null;
  }

  private initMasterGain(): void {
    if (!this.ctx) return;
    try {
      this.masterGain = this.ctx.createGain();
      const currentGain = this.muted ? 0 : this.volume;
      this.masterGain.gain.setValueAtTime(currentGain, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // Non-fatal fallback for stubs
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        const target = muted ? 0 : this.volume;
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(target, now + 0.02); // 20ms anti-click ramp
      } catch {
        // Fallback
      }
    }
  }

  public getMuted(): boolean {
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public setVolume(volume: number): void {
    const safeVolume = Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 0.3;
    this.volume = safeVolume;
    if (!this.muted && this.masterGain && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 0.02);
      } catch {
        // Fallback
      }
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public playPreset(preset: SoundPreset): { effectiveGain: number } {
    this.recordHistory(preset);

    if (this.muted) {
      return { effectiveGain: 0.0 };
    }

    // Trigger procedural acoustic synthesis
    switch (preset) {
      case 'chirp':
      case 'wave':
        this.playChirpInternal();
        break;
      case 'ready':
        this.playReadyInternal();
        break;
      case 'needs_input':
        this.playNeedsInputInternal();
        break;
      case 'blocked':
        this.playBlockedInternal();
        break;
      case 'drag':
        this.playDragInternal();
        break;
      case 'state_change':
        this.playStateChangeInternal();
        break;
    }

    return { effectiveGain: this.volume };
  }

  /**
   * For test harness model compatibility.
   */
  public playSound(name: string): { effectiveGain: number } {
    return this.playPreset(name as SoundPreset);
  }

  public playStateSound(state: AgentState): void {
    switch (state) {
      case 'ready':
        this.playPreset('ready');
        break;
      case 'needs_input':
        this.playPreset('needs_input');
        break;
      case 'blocked':
        this.playPreset('blocked');
        break;
      case 'waving':
        this.playPreset('chirp');
        break;
      case 'dragging':
        this.playPreset('drag');
        break;
      default:
        break;
    }
  }

  public playChirp(): void {
    this.playPreset('chirp');
  }

  public playWave(): void {
    this.playPreset('wave');
  }

  public playReady(): void {
    this.playPreset('ready');
  }

  public playNeedsInput(): void {
    this.playPreset('needs_input');
  }

  public playBlocked(): void {
    this.playPreset('blocked');
  }

  public playDrag(): void {
    this.playPreset('drag');
  }

  public getSoundHistory(): SoundHistoryEntry[] {
    return [...this.soundHistory];
  }

  public clearSoundHistory(): void {
    this.soundHistory = [];
  }

  private recordHistory(preset: SoundPreset): void {
    this.soundHistory.push({
      preset,
      timestamp: Date.now(),
      wasMuted: this.muted,
    });
    while (this.soundHistory.length > this.maxHistory) {
      this.soundHistory.shift();
    }
  }

  // ==========================================
  // PROCEDURAL ACOUSTIC SYNTHESIS IMPLEMENTATIONS
  // ==========================================

  /**
   * Preset 1: Wave / Chirp (Friendly 2-tone rising triangle chime)
   */
  private async playChirpInternal(): Promise<void> {
    if (!(await this.ensureContext()) || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;

      // Tone 1: 587.33 Hz (D5) -> 880.00 Hz (A5)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.07);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.35, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Tone 2: 880.00 Hz (A5) -> 1174.66 Hz (D6)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880.00, now + 0.06);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);

      gain2.gain.setValueAtTime(0.0001, now + 0.06);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.15);

      osc2.onended = () => {
        osc1.disconnect();
        gain1.disconnect();
        osc2.disconnect();
        gain2.disconnect();
      };
    } catch {
      // Ignore audio scheduling exceptions
    }
  }

  /**
   * Preset 2: Ready / Victory Jingle (Ascending 4-note major arpeggio with shimmer sparkle)
   */
  private async playReadyInternal(): Promise<void> {
    if (!(await this.ensureContext()) || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.08 }, // C5
        { freq: 659.25, time: 0.07, dur: 0.08 }, // E5
        { freq: 783.99, time: 0.14, dur: 0.09 }, // G5
        { freq: 1046.50, time: 0.21, dur: 0.32 }, // C6
      ];

      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const noteStart = now + n.time;
        const noteEnd = noteStart + n.dur;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(0.35, noteStart + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(noteStart);
        osc.stop(noteEnd);

        // Add detuned twin shimmer on final C6 note
        if (i === notes.length - 1) {
          const detuneOsc = this.ctx.createOscillator();
          const detuneGain = this.ctx.createGain();
          detuneOsc.type = 'sine';
          detuneOsc.frequency.setValueAtTime(n.freq + 4.0, noteStart); // +4 Hz beat

          detuneGain.gain.setValueAtTime(0.0001, noteStart);
          detuneGain.gain.linearRampToValueAtTime(0.25, noteStart + 0.02);
          detuneGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

          detuneOsc.connect(detuneGain);
          detuneGain.connect(this.masterGain);
          detuneOsc.start(noteStart);
          detuneOsc.stop(noteEnd);

          detuneOsc.onended = () => {
            detuneOsc.disconnect();
            detuneGain.disconnect();
          };
        }
      }
    } catch {
      // Ignore audio scheduling exceptions
    }
  }

  /**
   * Preset 3: Needs Input (Inquisitive rising sweep + relay tick)
   */
  private async playNeedsInputInternal(): Promise<void> {
    if (!(await this.ensureContext()) || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;

      // Layer A: 15ms acoustic button tick
      const noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.015), this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < output.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2400, now);
      noiseFilter.Q.setValueAtTime(4.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noiseSource.start(now);

      // Layer B: Rising vocalization sweep (440 Hz -> 880 Hz -> 987 Hz)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440.00, now);
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.16);
      osc.frequency.linearRampToValueAtTime(987.77, now + 0.20);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.20);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        noiseSource.disconnect();
        noiseFilter.disconnect();
        noiseGain.disconnect();
      };
    } catch {
      // Ignore audio scheduling exceptions
    }
  }

  /**
   * Preset 4: Blocked (Resonant lowpass dual sawtooth buzz)
   */
  private async playBlockedInternal(): Promise<void> {
    if (!(await this.ensureContext()) || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;

      // Pulse 1: 160 -> 120 Hz
      const osc1 = this.ctx.createOscillator();
      const filter1 = this.ctx.createBiquadFilter();
      const gain1 = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(160, now);
      osc1.frequency.linearRampToValueAtTime(120, now + 0.08);

      filter1.type = 'lowpass';
      filter1.frequency.setValueAtTime(340, now);
      filter1.Q.setValueAtTime(2.5, now);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.35, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc1.connect(filter1);
      filter1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Pulse 2: 130 -> 95 Hz (starts at now + 0.12s)
      const osc2 = this.ctx.createOscillator();
      const filter2 = this.ctx.createBiquadFilter();
      const gain2 = this.ctx.createGain();

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(130, now + 0.12);
      osc2.frequency.linearRampToValueAtTime(95, now + 0.23);

      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(300, now + 0.12);
      filter2.Q.setValueAtTime(2.5, now + 0.12);

      gain2.gain.setValueAtTime(0.0001, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.13);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

      osc2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.23);

      osc2.onended = () => {
        osc1.disconnect();
        filter1.disconnect();
        gain1.disconnect();
        osc2.disconnect();
        filter2.disconnect();
        gain2.disconnect();
      };
    } catch {
      // Ignore audio scheduling exceptions
    }
  }

  /**
   * Preset 5: Dragging (Swept bandpass white noise energy whoosh)
   */
  private async playDragInternal(): Promise<void> {
    if (!(await this.ensureContext()) || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;
      const bufferLength = Math.floor(this.ctx.sampleRate * 0.18);
      const buffer = this.ctx.createBuffer(1, bufferLength, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.09);
      filter.frequency.exponentialRampToValueAtTime(700, now + 0.18);
      filter.Q.setValueAtTime(3.5, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start(now);

      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // Ignore audio scheduling exceptions
    }
  }

  /**
   * State Change (Gentle rising blip)
   */
  private async playStateChangeInternal(): Promise<void> {
    if (!(await this.ensureContext()) || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.12);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // Ignore audio scheduling exceptions
    }
  }

  public dispose(): void {
    if (this.ctx && typeof this.ctx.close === 'function') {
      try {
        this.ctx.close();
      } catch {
        // Fallback
      }
    }
    this.ctx = null;
    this.masterGain = null;
  }
}

/**
 * Helper to create a lightweight mock AudioContext for unit tests.
 */
export function createMockAudioContext(): any {
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
    createOscillator: () => ({
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: {
        value: 350,
        setValueAtTime: () => {},
      },
      Q: {
        value: 1,
        setValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
    createBuffer: () => ({
      getChannelData: () => new Float32Array(100),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    }),
    resume: async () => {},
    close: async () => {},
  };
}
