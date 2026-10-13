/**
 * shared/types.ts
 * Core domain contracts and message schemas for AG Pet.
 */

/**
 * 7 modular agent lifecycle and interaction states.
 */
export type AgentState =
  | 'idle'
  | 'running'
  | 'needs_input'
  | 'ready'
  | 'blocked'
  | 'dragging'
  | 'waving'
  | 'sleeping'
  | 'thinking';

/**
 * Supported integer scaling factors for pixel-perfect rendering.
 */
export type PetScale = 1.0 | 1.5 | 2.0;

/**
 * Procedural audio preset identifiers.
 */
export type SoundPreset =
  | 'chirp'
  | 'wave'
  | 'ready'
  | 'needs_input'
  | 'blocked'
  | 'drag'
  | 'state_change';

/**
 * Metadata accompanying state updates from the transcript parser.
 */
export interface StateMetadata {
  toolName?: string;
  conversationId?: string;
  step?: number;
  durationMs?: number;
  errorMessage?: string;
  [key: string]: unknown;
}

/**
 * State broadcast payload transmitted over IPC / WebSocket.
 */
export interface StatePayload {
  state: AgentState;
  summary: string;
  timestamp: number;
  metadata?: StateMetadata;
}

/**
 * Persistent configuration stored in config.json.
 */
export interface PetConfig {
  x: number;
  y: number;
  scale: PetScale;
  isMuted: boolean;
  parentPid?: number;
  wsPort?: number;
}

/**
 * Client-to-server IPC message types and envelopes.
 */
export type IPCClientMessageType =
  | 'focus_ide'
  | 'pet_ready'
  | 'pet_close'
  | 'config_update';

export interface IPCClientMessage {
  type: IPCClientMessageType;
  version?: string;
  config?: Partial<PetConfig>;
}

/**
 * Server-to-client IPC message types and envelopes.
 */
export type IPCServerMessageType =
  | 'state_update'
  | 'config_update'
  | 'heartbeat'
  | 'ack';

export interface IPCServerMessage {
  type: IPCServerMessageType;
  payload?: StatePayload;
  config?: Partial<PetConfig>;
  timestamp?: number;
  messageId?: string;
}

/**
 * Particle simulation structure.
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;
}

/**
 * Modular skeletal bone transform for multi-part rigging.
 */
export interface PartTransform {
  dx: number;
  dy: number;
  rotation: number; // in radians
  scaleX: number;
  scaleY: number;
}

/**
 * Procedural screen eye expression identifiers.
 */
export type EyeExpression =
  | 'idle'
  | 'running'
  | 'ready'
  | 'needs_input'
  | 'blocked'
  | 'waving'
  | 'dragging'
  | 'sleeping'
  | 'thinking'
  | 'blink';

/**
 * 4-part anatomical skeletal rig pose with procedural eye orientation.
 */
export interface RigPose {
  torso: PartTransform;
  head: PartTransform;
  leftHand: PartTransform;
  rightHand: PartTransform;
  lookX: number;
  lookY: number;
  eyeScaleY: number;
  expression: EyeExpression;
}

/**
 * Dynamic anatomical pose calculated by the animator state machine.
 */
export interface AnimationPose {
  state: AgentState;
  time: number;
  bobY: number;
  torsoScaleX: number;
  torsoScaleY: number;
  headTilt: number;
  headOffsetX: number;
  headOffsetY: number;
  leftHandX: number;
  leftHandY: number;
  leftHandRot: number;
  rightHandX: number;
  rightHandY: number;
  rightHandRot: number;
  ringOffsetY: number;
  ringRadiusX: number;
  ringRadiusY: number;
  ringAlpha: number;
  starAlpha: number;
  shadowScale: number;
  shadowAlpha: number;
  bodyRotation: number;
  shudderX: number;
  gearFrame: number;
  particles: Particle[];
  rig?: RigPose;
}

/**
 * Inspection entry for audio synthesizer testing in headless environments.
 */
export interface SoundHistoryEntry {
  preset: SoundPreset;
  timestamp: number;
  wasMuted: boolean;
}

/**
 * Options for configuring the procedural audio synthesizer.
 */
export interface AudioEngineOptions {
  muted?: boolean;
  volume?: number;
  audioContext?: AudioContext | any;
}

/**
 * Options for configuring the pixel renderer.
 */
export interface RendererOptions {
  scale?: PetScale;
  baseMultiplier?: number;
  width?: number;
  height?: number;
  fps?: number;
}

/**
 * Options for the top-level PetEngine facade.
 */
export interface PetEngineOptions {
  scale?: PetScale;
  muted?: boolean;
  volume?: number;
  audioContext?: AudioContext | any;
  onStateChange?: (state: AgentState) => void;
}
