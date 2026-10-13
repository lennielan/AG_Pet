/**
 * sprite-engine/animator.ts
 * Multi-part skeletal animation engine and continuous kinematic controller for AG Pet.
 * Features 4-component skeletal rigging (torso, head, leftHand, rightHand),
 * exponential decay lerp blending, overlapping action, micro-behaviors (blinking, glancing),
 * victory cheer jump (zero 360° spin), and particle simulation across all 7 agent states.
 */

import { AgentState, AnimationPose, EyeExpression, Particle, PartTransform, RigPose, SoundPreset } from '../shared/types';
import { SCREEN_EXPRESSIONS } from '../shared/constants';

function createTransform(dx = 0, dy = 0, rotation = 0, scaleX = 1.0, scaleY = 1.0): PartTransform {
  return { dx, dy, rotation, scaleX, scaleY };
}

function cloneTransform(t: PartTransform): PartTransform {
  return { dx: t.dx, dy: t.dy, rotation: t.rotation, scaleX: t.scaleX, scaleY: t.scaleY };
}

function createDefaultRig(): RigPose {
  return {
    torso: createTransform(),
    head: createTransform(),
    leftHand: createTransform(),
    rightHand: createTransform(),
    lookX: 0,
    lookY: 0,
    eyeScaleY: 1.0,
    expression: 'idle',
  };
}

function lerpPart(curr: PartTransform, target: PartTransform, alpha: number): void {
  curr.dx += (target.dx - curr.dx) * alpha;
  curr.dy += (target.dy - curr.dy) * alpha;
  curr.rotation += (target.rotation - curr.rotation) * alpha;
  curr.scaleX += (target.scaleX - curr.scaleX) * alpha;
  curr.scaleY += (target.scaleY - curr.scaleY) * alpha;
}

export class PetAnimator {
  private currentState: AgentState = 'idle';
  private previousState: AgentState = 'idle';
  private persistentState: AgentState = 'idle';
  private stateTime = 0;
  private totalTime = 0;
  private dragVelocity = { x: 0, y: 0 };
  private smoothedVelocity = { x: 0, y: 0 };
  private particles: Particle[] = [];
  private particleSpawnTimer = 0;
  private sleepParticleToggle = false;
  private history: AgentState[] = ['idle'];
  private currentPose: AnimationPose;

  // Skeletal Rigging State
  private currentRig: RigPose = createDefaultRig();
  private readonly smoothingSpeed = 16.0; // Exponential lerp decay constant

  // Micro-behaviors: Blinking and Wandering Glance
  private blinkTimer = 3.5;
  private isBlinking = false;
  private blinkProgress = 0;

  private glanceTimer = 5.0;
  private isGlancing = false;
  private glanceProgress = 0;
  private targetGlanceX = 0;
  private targetGlanceY = 0;

  public onSoundTrigger?: (preset: SoundPreset) => void;
  public onStateChange?: (state: AgentState) => void;

  // Baseline coordinates in native 64x64 frame for backward compatibility
  private readonly BASE_LEFT_HAND_X = 18;
  private readonly BASE_LEFT_HAND_Y = 38;
  private readonly BASE_RIGHT_HAND_X = 46;
  private readonly BASE_RIGHT_HAND_Y = 38;
  private readonly BASE_RING_Y = 48;

  constructor(initialState: AgentState = 'idle') {
    this.currentState = initialState;
    this.persistentState = (initialState !== 'dragging' && initialState !== 'waving') ? initialState : 'idle';
    this.currentPose = this.computePoseSnapshot();
  }

  public setState(newState: AgentState): void {
    if (this.currentState === newState) return;
    this.previousState = this.currentState;
    this.currentState = newState;
    if (newState !== 'dragging' && newState !== 'waving') {
      this.persistentState = newState;
    }
    this.stateTime = 0;
    this.history.push(newState);
    while (this.history.length > 100) {
      this.history.shift();
    }

    // Trigger state-specific one-shot audio or particles
    if (newState === 'ready') {
      this.spawnCelebrationBurst();
      this.onSoundTrigger?.('ready');
    } else if (newState === 'waving') {
      this.onSoundTrigger?.('chirp');
    } else if (newState === 'needs_input') {
      this.onSoundTrigger?.('needs_input');
    } else if (newState === 'blocked') {
      this.onSoundTrigger?.('blocked');
    } else if (newState === 'dragging') {
      this.onSoundTrigger?.('drag');
    }

    this.onStateChange?.(newState);
  }

  public getPersistentState(): AgentState {
    return this.persistentState;
  }

  public setPersistentState(state: AgentState): void {
    if (state !== 'dragging' && state !== 'waving') {
      this.persistentState = state;
    }
  }

  public transitionTo(newState: AgentState, reason?: string): void {
    this.setState(newState);
  }

  public getState(): AgentState {
    return this.currentState;
  }

  public getHistory(): AgentState[] {
    return [...this.history];
  }

  public getScreenExpression(): string {
    return SCREEN_EXPRESSIONS[this.currentState] || SCREEN_EXPRESSIONS.idle;
  }

  public setDragVelocity(vx: number, vy: number): void {
    this.dragVelocity.x = vx;
    this.dragVelocity.y = vy;
  }

  public getCurrentFrame(): AnimationPose {
    return this.currentPose;
  }

  public getRigPose(): RigPose {
    return {
      torso: cloneTransform(this.currentRig.torso),
      head: cloneTransform(this.currentRig.head),
      leftHand: cloneTransform(this.currentRig.leftHand),
      rightHand: cloneTransform(this.currentRig.rightHand),
      lookX: this.currentRig.lookX,
      lookY: this.currentRig.lookY,
      eyeScaleY: this.currentRig.eyeScaleY,
      expression: this.currentRig.expression,
    };
  }

  public update(dt: number, externalState?: AgentState): AnimationPose {
    // Guard against NaN / non-finite delta times and clamp to [0, 100ms]
    const safeDt = Number.isFinite(dt) ? dt : (Number.isNaN(dt) ? 0 : (dt > 0 ? 0.100 : 0));
    const clampedDt = Math.min(Math.max(safeDt, 0), 0.100);
    this.stateTime += clampedDt;
    this.totalTime += clampedDt;

    if (externalState && externalState !== this.currentState) {
      this.setState(externalState);
    }

    // Velocity smoothing for drag aerodynamics
    const lambda = 0.35;
    this.smoothedVelocity.x = (1 - lambda) * this.smoothedVelocity.x + lambda * this.dragVelocity.x;
    this.smoothedVelocity.y = (1 - lambda) * this.smoothedVelocity.y + lambda * this.dragVelocity.y;

    this.updateParticles(clampedDt);
    this.updateMicroBehaviors(clampedDt);

    // Compute raw target rig pose according to active state choreography
    let targetRig: RigPose;
    switch (this.currentState) {
      case 'idle':
        targetRig = this.computeIdleTarget(clampedDt);
        break;
      case 'running':
        targetRig = this.computeRunningTarget(clampedDt);
        break;
      case 'needs_input':
        targetRig = this.computeNeedsInputTarget(clampedDt);
        break;
      case 'ready':
        targetRig = this.computeReadyTarget(clampedDt);
        break;
      case 'blocked':
        targetRig = this.computeBlockedTarget(clampedDt);
        break;
      case 'sleeping':
        targetRig = this.computeSleepingTarget(clampedDt);
        break;
      case 'thinking':
        targetRig = this.computeThinkingTarget(clampedDt);
        break;
      case 'dragging':
        targetRig = this.computeDraggingTarget(clampedDt);
        break;
      case 'waving':
        targetRig = this.computeWavingTarget(clampedDt);
        // One-shot wave sequence ends at 1.20s
        if (this.stateTime >= 1.20) {
          this.setState(this.persistentState);
        }
        break;
      default:
        targetRig = this.computeIdleTarget(clampedDt);
        break;
    }

    // Exponential Decay Lerp Blending
    const alpha = 1.0 - Math.exp(-this.smoothingSpeed * clampedDt);
    lerpPart(this.currentRig.torso, targetRig.torso, alpha);
    lerpPart(this.currentRig.head, targetRig.head, alpha);
    lerpPart(this.currentRig.leftHand, targetRig.leftHand, alpha);
    lerpPart(this.currentRig.rightHand, targetRig.rightHand, alpha);

    this.currentRig.lookX += (targetRig.lookX - this.currentRig.lookX) * alpha;
    this.currentRig.lookY += (targetRig.lookY - this.currentRig.lookY) * alpha;
    this.currentRig.eyeScaleY += (targetRig.eyeScaleY - this.currentRig.eyeScaleY) * alpha;
    this.currentRig.expression = targetRig.expression;

    // Snapshot integrated AnimationPose for renderer & test contracts
    this.currentPose = this.computePoseSnapshot();
    return this.currentPose;
  }

  private updateMicroBehaviors(dt: number): void {
    // 1. Random Eye Blinking (every 3-6s, lasting 140ms)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      if (!this.isBlinking) {
        this.isBlinking = true;
        this.blinkProgress = 0;
      }
    }

    if (this.isBlinking) {
      this.blinkProgress += dt;
      const blinkDuration = 0.14;
      if (this.blinkProgress >= blinkDuration) {
        this.isBlinking = false;
        this.blinkTimer = 3.0 + Math.random() * 3.0; // 3 to 6s
      }
    }

    // 2. Random Wandering Glance (every 4-7s, lasting 1.0s)
    this.glanceTimer -= dt;
    if (this.glanceTimer <= 0) {
      if (!this.isGlancing) {
        this.isGlancing = true;
        this.glanceProgress = 0;
        this.targetGlanceX = (Math.random() - 0.5) * 5.0; // -2.5..+2.5 px
        this.targetGlanceY = (Math.random() - 0.5) * 2.0; // -1..+1 px
      }
    }

    if (this.isGlancing) {
      this.glanceProgress += dt;
      const glanceDuration = 1.0;
      if (this.glanceProgress >= glanceDuration) {
        this.isGlancing = false;
        this.glanceTimer = 4.0 + Math.random() * 3.0; // 4 to 7s
        this.targetGlanceX = 0;
        this.targetGlanceY = 0;
      }
    }
  }

  /**
   * Choreography 1: IDLE
   * Overlapping Action (omega ~ 2.2 rad/s), head phase lag -0.35, hands lag -0.75,
   * random micro-blinking and wandering glance.
   */
  private computeIdleTarget(dt: number): RigPose {
    const t = this.totalTime;
    const omega = 2.2;

    // Torso breathing & floating
    const torsoDy = Math.sin(omega * t) * 2.5;
    const torsoRot = 0;
    const torsoScaleY = 1.0 + 0.02 * Math.cos(omega * t);
    const torsoScaleX = 1.0 - 0.01 * Math.cos(omega * t);

    // Head trailing torso with phase lag (-0.35 rad)
    const headDy = Math.sin(omega * t - 0.35) * 2.5;
    const headRot = 0;

    // Hands trailing with deeper phase lag (-0.75 rad)
    const handWave = Math.sin(omega * t - 0.75) * 2.8;
    const leftHandDx = -0.5 * Math.cos(1.2 * t);
    const leftHandDy = handWave;
    const leftHandRot = 0;

    const rightHandDx = 0.5 * Math.cos(1.2 * t);
    const rightHandDy = handWave;
    const rightHandRot = 0;

    // Micro-behaviors
    let eyeScaleY = 1.0;
    if (this.isBlinking) {
      const tau = Math.min(1.0, this.blinkProgress / 0.14);
      eyeScaleY = 1.0 - 0.90 * Math.sin(Math.PI * tau);
    }

    let lookX = 0;
    let lookY = 0;
    if (this.isGlancing) {
      const tau = Math.min(1.0, this.glanceProgress / 1.0);
      const arc = Math.sin(Math.PI * tau);
      lookX = this.targetGlanceX * arc;
      lookY = this.targetGlanceY * arc;
    }

    return {
      torso: createTransform(0, torsoDy, torsoRot, torsoScaleX, torsoScaleY),
      head: createTransform(0, headDy, headRot, 1.0, 1.0),
      leftHand: createTransform(leftHandDx, leftHandDy, leftHandRot, 1.0, 1.0),
      rightHand: createTransform(rightHandDx, rightHandDy, rightHandRot, 1.0, 1.0),
      lookX,
      lookY,
      eyeScaleY,
      expression: eyeScaleY < 0.25 ? 'blink' : 'idle',
    };
  }

  /**
   * Choreography 2: RUNNING
   * Energetic hover, focused head lean, darting code-reading eyes,
   * alternating typing hands at 18 rad/s anti-phase.
   */
  private computeRunningTarget(dt: number): RigPose {
    const t = this.totalTime;

    // Computational hover
    const torsoDy = Math.sin(3.5 * t) * 1.2;
    const torsoRot = 0;

    // Head tilted forward towards keyboard, scanning code
    const headDy = torsoDy + 0.8;
    const headDx = Math.sin(2.8 * t) * 0.8;
    const headRot = 0;

    // Hands swept inwards towards keyboard center with horizontal typing sweep
    const leftSweep = Math.sin(5.5 * t) * 1.8 + Math.cos(3.2 * t) * 0.8;
    const leftHandDx = 4.8 + leftSweep;

    const rightSweep = Math.cos(6.0 * t) * 1.8 + Math.sin(3.7 * t) * 0.8;
    const rightHandDx = -4.8 + rightSweep;

    // Fast typing taps
    const leftTap = Math.abs(Math.sin(16.0 * t)) * 2.8 - 2.2;
    const rightTap = Math.abs(Math.cos(16.0 * t)) * 2.8 - 2.2;
    const leftHandDy = leftTap;
    const rightHandDy = rightTap;
    const leftHandRot = 0;
    const rightHandRot = 0;

    // Code-reading glance along terminal lines
    const lookX = Math.sin(5.5 * t) * 2.5;
    const lookY = 0.5;

    // Quadrupled ring particles
    this.particleSpawnTimer += dt;
    if (this.particleSpawnTimer >= 0.15) {
      this.particleSpawnTimer = 0;
      this.spawnRingParticle(32, this.BASE_RING_Y + torsoDy * 0.5, 2.0);
    }

    return {
      torso: createTransform(0, torsoDy, torsoRot, 1.0, 1.0),
      head: createTransform(headDx, headDy, headRot, 1.0, 1.0),
      leftHand: createTransform(leftHandDx, leftHandDy, leftHandRot, 1.0, 1.0),
      rightHand: createTransform(rightHandDx, rightHandDy, rightHandRot, 1.0, 1.0),
      lookX,
      lookY,
      eyeScaleY: 1.0,
      expression: 'running',
    };
  }

  /**
   * Choreography 3: NEEDS_INPUT
   * Inquisitive upright posture with thinking hand under chin, amber question eyes.
   */
  private computeNeedsInputTarget(dt: number): RigPose {
    const t = this.totalTime;
    const bob = Math.sin(1.5 * t) * 1.2;

    const torsoDy = bob;
    const headDy = bob - 0.5;

    // Thinking hand at chin/visor (uses gravi_right_hand_think_256.png)
    const rightHandDy = bob * 0.5;

    // Relaxed resting left hand
    const leftHandDy = 1.5 + bob;

    return {
      torso: createTransform(0, torsoDy, 0, 1.0, 1.0),
      head: createTransform(0, headDy, 0, 1.0, 1.0),
      leftHand: createTransform(0, leftHandDy, 0, 1.0, 1.0),
      rightHand: createTransform(0, rightHandDy, 0, 1.0, 1.0),
      lookX: 1.5, // Looking up and right questioningly
      lookY: -1.0,
      eyeScaleY: 1.0,
      expression: 'needs_input',
    };
  }

  /**
   * Choreography 4: READY (Victory Cheer Jump, ZERO 360° SPIN)
   * Phase 1: 0..0.15s crouch
   * Phase 2: 0.15..0.65s victory jump (dy = -7.0, both hands raised dy = -9.0, head wobble)
   * Phase 3: 0.65..1.2s soft springy landing with decaying rebound
   * Phase 4: >1.2s joyous cheer celebration hover
   */
  private computeReadyTarget(dt: number): RigPose {
    const t = this.stateTime;
    let torsoDy = 0;
    let torsoScaleX = 1.0;
    let torsoScaleY = 1.0;
    let headDy = 0;
    let headRot = 0;
    let leftHandDy = 0;
    let rightHandDy = 0;
    let leftHandRot = 0;
    let rightHandRot = 0;

    if (t < 0.15) {
      // Phase 1: Crouch & Anticipation
      const tau = t / 0.15;
      torsoDy = 2.5 * tau;
      headDy = 2.5 * tau;
      torsoScaleY = 1.0 - 0.15 * tau;
      torsoScaleX = 1.0 + 0.10 * tau;
      leftHandDy = 3.0 * tau;
      rightHandDy = 3.0 * tau;
    } else if (t < 0.65) {
      // Phase 2: Victory Leap & Cheer (Apex dy = -7.0, Hands dy = -9.0, zero rotation staircases)
      const tau = (t - 0.15) / 0.50;
      const jumpArc = 4.0 * tau * (1.0 - tau); // Parabolic 0 -> 1 -> 0

      torsoDy = 2.5 * (1.0 - tau) - 7.0 * jumpArc;
      headDy = torsoDy - 1.0 * jumpArc;
      headRot = 0;

      torsoScaleY = 1.0 + 0.15 * jumpArc;
      torsoScaleX = 1.0 - 0.10 * jumpArc;

      // Both hands raised high in celebratory cheer (uses gravi_*_hand_up_256.png)
      leftHandDy = -9.0 * jumpArc;
      rightHandDy = -9.0 * jumpArc;
      leftHandRot = 0;
      rightHandRot = 0;
    } else if (t < 1.20) {
      // Phase 3: Soft springy landing with decaying rebound
      const tau = (t - 0.65) / 0.55;
      const decay = Math.exp(-6.0 * tau);
      const rebound = Math.sin(12.0 * Math.PI * tau) * decay * 2.0;

      torsoDy = rebound;
      headDy = rebound * 0.8;
      headRot = 0;
      leftHandDy = -4.0 * decay + rebound;
      rightHandDy = -4.0 * decay + rebound;
      leftHandRot = 0;
      rightHandRot = 0;
    } else {
      // Phase 4: Continuing Joyous Cheer Hover
      const loopT = t - 1.20;
      torsoDy = Math.sin(3.0 * loopT) * 1.8;
      headDy = torsoDy;
      headRot = 0;
      leftHandDy = -5.0 + Math.sin(3.0 * loopT) * 1.0;
      rightHandDy = -5.0 + Math.sin(3.0 * loopT) * 1.0;
      leftHandRot = 0;
      rightHandRot = 0;
    }

    return {
      torso: createTransform(0, torsoDy, 0, torsoScaleX, torsoScaleY),
      head: createTransform(0, headDy, headRot, 1.0, 1.0),
      leftHand: createTransform(0, leftHandDy, leftHandRot, 1.0, 1.0),
      rightHand: createTransform(0, rightHandDy, rightHandRot, 1.0, 1.0),
      lookX: 0,
      lookY: -0.5,
      eyeScaleY: 1.0,
      expression: 'ready',
    };
  }

  /**
   * Choreography 5: BLOCKED
   * Depressed posture, decaying shudder jitter (first 0.4s), drooping hands, red cross eyes.
   */
  private computeBlockedTarget(dt: number): RigPose {
    const t = this.stateTime;

    // High frequency glitch shudder on error entry
    const decay = Math.exp(-6.0 * t);
    const shudder = t < 0.4 ? Math.sin(35.0 * t) * 2.0 * decay : 0;

    // Depressed drooping hover
    const bob = Math.sin(1.2 * this.totalTime) * 0.8;
    const torsoDy = 3.5 + bob;
    const headDy = 3.5 + bob;

    // Limply drooping hands
    const leftHandDy = 5.0 + bob;
    const rightHandDy = 5.0 + bob;

    return {
      torso: createTransform(shudder, torsoDy, 0, 1.02, 0.98),
      head: createTransform(shudder * 1.2, headDy, 0, 1.0, 1.0),
      leftHand: createTransform(0, leftHandDy, 0, 1.0, 1.0),
      rightHand: createTransform(0, rightHandDy, 0, 1.0, 1.0),
      lookX: 0,
      lookY: 1.0,
      eyeScaleY: 1.0,
      expression: 'blocked',
    };
  }

  /**
   * Choreography 6: DRAGGING
   * Aerodynamic body tilt, head lagging behind tilt, trailing spring hands (resistance up to +/-6px),
   * squinting eyes '> <'.
   */
  private computeDraggingTarget(dt: number): RigPose {
    const vx = this.smoothedVelocity.x;
    const vy = this.smoothedVelocity.y;

    // Aerodynamic tilt (+/- 15 degrees / 0.26 rad)
    const tilt = Math.max(-0.26, Math.min(0.26, (vx / 400.0) * 0.26));

    // Pitch squash/stretch
    const torsoScaleY = Math.max(0.88, Math.min(1.15, 1.0 - vy / 1200.0));
    const torsoScaleX = 1.0 / torsoScaleY;

    // Head lags body tilt
    const headRot = tilt * 0.6;

    // Hands trailing behind on springs
    const handDx = Math.max(-6.0, Math.min(6.0, -0.015 * vx));
    const handDy = Math.max(-6.0, Math.min(6.0, -0.015 * vy));

    // Trail particle emission
    this.particleSpawnTimer += dt;
    if (this.particleSpawnTimer >= 0.08) {
      this.particleSpawnTimer = 0;
      this.spawnTrailParticle(32, this.BASE_RING_Y, -0.4 * vx, -0.4 * vy);
    }

    return {
      torso: createTransform(0, 0, tilt, torsoScaleX, torsoScaleY),
      head: createTransform(0, 0, headRot, 1.0, 1.0),
      leftHand: createTransform(handDx, handDy, tilt, 1.0, 1.0),
      rightHand: createTransform(handDx, handDy, tilt, 1.0, 1.0),
      lookX: 0,
      lookY: 0,
      eyeScaleY: 0.85,
      expression: 'dragging',
    };
  }

  /**
   * Choreography 7: WAVING (One-shot click response, 1.2s duration)
   * Friendly head nod (-7 deg), screen-right hand waving near ear, friendly wink.
   */
  private computeWavingTarget(dt: number): RigPose {
    const t = this.stateTime;
    const bob = Math.sin(2.2 * this.totalTime) * 1.5;

    // Friendly head nod (-7 deg / -0.12 rad)
    const headRot = -0.12 + 0.04 * Math.cos(15.0 * t);
    const headDy = bob - 0.5;

    let rightHandDx = 0;
    let rightHandDy = 0;
    let rightHandRot = 0;

    if (t < 0.15) {
      // Raise hand to ear
      const tau = t / 0.15;
      rightHandDx = 3.5 * tau;
      rightHandDy = -8.5 * tau;
      rightHandRot = -0.35 * tau;
    } else if (t < 0.95) {
      // Wave 3-4 times at ear pod level
      const waveT = t - 0.15;
      rightHandDx = 3.5 + 2.0 * Math.sin(20.0 * waveT);
      rightHandDy = -8.5;
      rightHandRot = -0.35 + 0.30 * Math.sin(20.0 * waveT);
    } else {
      // Lower hand back smoothly
      const tau = (t - 0.95) / 0.25;
      rightHandDx = 3.5 * (1.0 - tau);
      rightHandDy = -8.5 * (1.0 - tau);
      rightHandRot = -0.35 * (1.0 - tau);
    }

    return {
      torso: createTransform(0, bob, 0, 1.0, 1.0),
      head: createTransform(0, headDy, headRot, 1.0, 1.0),
      leftHand: createTransform(0, bob, 0, 1.0, 1.0),
      rightHand: createTransform(rightHandDx, rightHandDy, rightHandRot, 1.0, 1.0),
      lookX: 0,
      lookY: 0,
      eyeScaleY: 1.0,
      expression: 'waving',
    };
  }

  /**
   * Choreography 8: SLEEPING
   * Slow, calm breathing bob, drooping head, relaxed floating hands, floating Z particles.
   */
  private computeSleepingTarget(dt: number): RigPose {
    const bob = Math.sin(1.0 * this.totalTime) * 0.8;
    const headDy = bob + 1.0;

    // Spawn sleep particles 'Z' / 'z' every 0.95 seconds
    this.particleSpawnTimer += dt;
    if (this.particleSpawnTimer >= 0.95) {
      this.particleSpawnTimer = 0;
      this.spawnSleepParticle(40, 18);
    }

    return {
      torso: createTransform(0, bob, 0, 1.0, 1.0),
      head: createTransform(0, headDy, 0, 1.0, 1.0),
      leftHand: createTransform(0, bob + 0.6, 0, 1.0, 1.0),
      rightHand: createTransform(0, bob + 0.6, 0, 1.0, 1.0),
      lookX: 0,
      lookY: 1.0,
      eyeScaleY: 0.2,
      expression: 'sleeping',
    };
  }

  /**
   * Choreography 9: THINKING
   * Pensive hover, upright head, right hand gently tapping chin, thoughtful Astro Bot gaze.
   */
  private computeThinkingTarget(dt: number): RigPose {
    const t = this.totalTime;
    const torsoDy = Math.sin(1.8 * t) * 1.5;
    const headDy = torsoDy - 0.8;

    // Right hand at chin tapping gently (gravi_right_hand_think_256.png)
    const rightHandDy = torsoDy + Math.sin(5.0 * t) * 0.8;
    const leftHandDy = torsoDy * 0.8;

    const lookX = Math.sin(1.2 * t) * 1.8;
    const lookY = -1.0;

    return {
      torso: createTransform(0, torsoDy, 0, 1.0, 1.0),
      head: createTransform(0, headDy, 0, 1.0, 1.0),
      leftHand: createTransform(0, leftHandDy, 0, 1.0, 1.0),
      rightHand: createTransform(0, rightHandDy, 0, 1.0, 1.0),
      lookX,
      lookY,
      eyeScaleY: 1.0,
      expression: 'thinking',
    };
  }

  private computePoseSnapshot(): AnimationPose {
    const rig = this.currentRig;
    const gearFrame = Math.floor((this.stateTime * 8) % 4);

    return {
      state: this.currentState,
      time: this.stateTime,
      bobY: rig.torso.dy,
      torsoScaleX: rig.torso.scaleX,
      torsoScaleY: rig.torso.scaleY,
      headTilt: rig.head.rotation,
      headOffsetX: rig.head.dx,
      headOffsetY: rig.head.dy,
      leftHandX: this.BASE_LEFT_HAND_X + rig.leftHand.dx,
      leftHandY: this.BASE_LEFT_HAND_Y + rig.leftHand.dy,
      leftHandRot: rig.leftHand.rotation,
      rightHandX: this.BASE_RIGHT_HAND_X + rig.rightHand.dx,
      rightHandY: this.BASE_RIGHT_HAND_Y + rig.rightHand.dy,
      rightHandRot: rig.rightHand.rotation,
      ringOffsetY: rig.torso.dy * 0.5,
      ringRadiusX: 10.5,
      ringRadiusY: 3.3,
      ringAlpha: this.currentState === 'blocked' ? 0.3 : 1.0,
      starAlpha: 1.0,
      shadowScale: 1.0,
      shadowAlpha: 0.6,
      bodyRotation: rig.torso.rotation,
      shudderX: rig.torso.dx,
      gearFrame,
      particles: this.particles,
      rig: {
        torso: cloneTransform(rig.torso),
        head: cloneTransform(rig.head),
        leftHand: cloneTransform(rig.leftHand),
        rightHand: cloneTransform(rig.rightHand),
        lookX: rig.lookX,
        lookY: rig.lookY,
        eyeScaleY: rig.eyeScaleY,
        expression: rig.expression,
      },
    };
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x = Math.max(0, Math.min(64, p.x + p.vx * dt));
      p.y = Math.max(0, Math.min(64, p.y + p.vy * dt));
    }
  }

  private spawnRingParticle(centerX: number, centerY: number, speedMultiplier = 1.0): void {
    const angle = Math.random() * 2 * Math.PI;
    const rx = 10;
    const ry = 3.2;
    this.particles.push({
      x: Math.max(0, Math.min(64, centerX + rx * Math.cos(angle))),
      y: Math.max(0, Math.min(64, centerY + ry * Math.sin(angle))),
      vx: (Math.random() - 0.5) * 6 * speedMultiplier,
      vy: (6 + Math.random() * 8) * speedMultiplier,
      life: 0.6,
      maxLife: 0.6,
      color: '#00F0FF',
      size: 1,
    });
  }

  private spawnTrailParticle(centerX: number, centerY: number, baseVx: number, baseVy: number): void {
    this.particles.push({
      x: Math.max(0, Math.min(64, centerX + (Math.random() - 0.5) * 8)),
      y: Math.max(0, Math.min(64, centerY + (Math.random() - 0.5) * 4)),
      vx: baseVx + (Math.random() - 0.5) * 10,
      vy: baseVy + (Math.random() - 0.5) * 10,
      life: 0.35,
      maxLife: 0.35,
      color: '#5AFAEF',
      size: 1 + Math.round(Math.random()),
    });
  }

  private spawnCelebrationBurst(): void {
    const count = 12;
    const colors = ['#FAE756', '#00F0FF', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const speed = 25 + Math.random() * 15;
      this.particles.push({
        x: 32,
        y: Math.max(0, Math.min(64, this.BASE_RING_Y)),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8,
        maxLife: 0.8,
        color: colors[i % colors.length],
        size: 1 + (i % 2),
      });
    }
  }

  private spawnSleepParticle(startX: number, startY: number): void {
    this.sleepParticleToggle = !this.sleepParticleToggle;
    const isBig = this.sleepParticleToggle;
    this.particles.push({
      x: startX,
      y: startY,
      vx: 1.8,
      vy: -6.5,
      life: 2.4,
      maxLife: 2.4,
      color: '#7DD3FC',
      size: isBig ? 6 : 4,
      text: isBig ? 'Z' : 'z',
    });
  }
}

// Public alias for index.ts export
export { PetAnimator as AnimationController };
