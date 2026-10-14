/**
 * sprite-engine/index.ts
 * Public entrypoint and unified lifecycle facade for the AG Pet Sprite Engine.
 */

export * from '../shared/types';
export * from '../shared/constants';
export * from './assets/palette';
export * from './assets/robot-sprites';
export * from './renderer';
export * from './animator';
export * from './audio';

import { AgentState, PetEngineOptions, PetScale, SoundPreset } from '../shared/types';
import { DEFAULT_SCALE, DEFAULT_IS_MUTED, DEFAULT_MASTER_VOLUME } from '../shared/constants';
import { PetRenderer } from './renderer';
import { PetAnimator } from './animator';
import { SoundSynthesizer } from './audio';

/**
 * High-level orchestrator unifying canvas rendering, kinematic animation,
 * and procedural sound synthesis into a coherent public API.
 */
export class PetEngine {
  private canvas: HTMLCanvasElement;
  private renderer: PetRenderer;
  private animator: PetAnimator;
  private audio: SoundSynthesizer;
  private currentState: AgentState = 'idle';
  private scale: PetScale = DEFAULT_SCALE;
  private isRunning = false;
  private suppressAudio = false;
  private onStateChangeCallback?: (state: AgentState) => void;

  constructor(canvas: HTMLCanvasElement, options: PetEngineOptions = {}) {
    this.canvas = canvas;
    this.scale = options.scale ?? DEFAULT_SCALE;
    this.onStateChangeCallback = options.onStateChange;

    this.animator = new PetAnimator('idle');
    this.renderer = new PetRenderer(this.canvas, {
      scale: this.scale,
      animator: this.animator,
    });
    this.audio = new SoundSynthesizer({
      muted: options.muted ?? DEFAULT_IS_MUTED,
      volume: options.volume ?? DEFAULT_MASTER_VOLUME,
      audioContext: options.audioContext,
      maxHistory: 100,
    });

    // Wire animator sound triggers to synthesizer
    this.animator.onSoundTrigger = (preset: SoundPreset) => {
      if (!this.suppressAudio) {
        this.audio.playPreset(preset);
      }
    };

    // Keep PetEngine synchronized with animator state transitions (e.g. waving completion)
    this.animator.onStateChange = (state: AgentState) => {
      this.currentState = state;
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(state);
      }
    };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.renderer.start();
  }

  public stop(): void {
    this.isRunning = false;
    this.renderer.stop();
  }

  public setState(state: AgentState, playAudio = true): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.suppressAudio = !playAudio;
    try {
      this.animator.setState(state);
    } finally {
      this.suppressAudio = false;
    }

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
  }

  public getState(): AgentState {
    return this.currentState;
  }

  public setScale(scale: PetScale): void {
    this.scale = scale;
    this.renderer.setScale(scale);
  }

  public getScale(): PetScale {
    return this.scale;
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public getMuted(): boolean {
    return this.audio.getMuted();
  }

  public isMuted(): boolean {
    return this.audio.isMuted();
  }

  public toggleMute(): boolean {
    return this.audio.toggleMute();
  }

  public playSound(preset: SoundPreset): void {
    this.audio.playPreset(preset);
  }

  public onClick(): void {
    // Wake up if sleeping and play cheerful waving greeting on click
    if (this.currentState === 'sleeping' || this.animator.getPersistentState() === 'sleeping') {
      this.animator.setPersistentState('idle');
    }
    this.setState('waving', true);
  }

  public triggerHeadpat(duration = 2.4): void {
    if (this.currentState === 'sleeping' || this.animator.getPersistentState() === 'sleeping') {
      this.animator.setPersistentState('idle');
    }
    this.animator.triggerHeadpat(duration);
    this.audio.playPreset('headpat');
  }

  public getAnimator(): PetAnimator {
    return this.animator;
  }

  public onDragStart(): void {
    if (this.currentState === 'sleeping' || this.animator.getPersistentState() === 'sleeping') {
      this.animator.setPersistentState('idle');
    }
    this.setState('dragging', true);
  }

  public onDragEnd(): void {
    const returnState = this.animator.getPersistentState();
    this.setState(returnState, false);
  }

  public getPersistentState(): AgentState {
    return this.animator.getPersistentState();
  }

  public setPersistentState(state: AgentState): void {
    this.animator.setPersistentState(state);
  }

  public setDragVelocity(vx: number, vy: number): void {
    this.animator.setDragVelocity(vx, vy);
  }

  public getRenderer(): PetRenderer {
    return this.renderer;
  }

  public getAudio(): SoundSynthesizer {
    return this.audio;
  }

  public dispose(): void {
    this.stop();
    this.audio.dispose();
  }
}
