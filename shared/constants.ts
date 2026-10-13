/**
 * shared/constants.ts
 * Authoritative system constants, default configurations, and timing thresholds.
 */

import { AgentState, PetConfig, PetScale, StatePayload, IPCClientMessage, IPCServerMessage } from './types';

export const ALL_AGENT_STATES: readonly AgentState[] = [
  'idle',
  'running',
  'needs_input',
  'ready',
  'blocked',
  'dragging',
  'waving',
  'sleeping',
  'thinking',
] as const;

export const SUPPORTED_SCALES: readonly PetScale[] = [1.0, 1.5, 2.0] as const;

export const DEFAULT_SCALE: PetScale = 1.0;
export const DEFAULT_IS_MUTED = false;
export const DEFAULT_MASTER_VOLUME = 0.3;

export const DEFAULT_PET_X = 120;
export const DEFAULT_PET_Y = 120;
export const DEFAULT_WS_PORT = 38472;

export const DEFAULT_CONFIG: Readonly<PetConfig> = {
  x: DEFAULT_PET_X,
  y: DEFAULT_PET_Y,
  scale: DEFAULT_SCALE,
  isMuted: DEFAULT_IS_MUTED,
  wsPort: DEFAULT_WS_PORT,
};

export const CONFIG_FILE_NAME = 'ag-pet-config.json';

/**
 * Sprite canvas geometry invariants.
 */
export const CANVAS_BASE_SIZE = 64;
export const SPRITE_GRID_WIDTH = 64;
export const SPRITE_GRID_HEIGHT = 64;
export const TARGET_FPS = 60;
export const FRAME_TIME_MS = 1000 / TARGET_FPS; // ~16.666 ms

/**
 * IPC, process watchdog, and reconnect thresholds.
 */
export const PID_WATCHDOG_POLL_INTERVAL_MS = 500;
export const IPC_HEARTBEAT_INTERVAL_MS = 2000;
export const IPC_HEARTBEAT_TIMEOUT_MS = 6000;
export const WS_RECONNECT_INTERVAL_MS = 1500;
export const WS_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Facial expressions text glyphs.
 */
export const SCREEN_EXPRESSIONS: Record<AgentState, string> = {
  idle: '^ ^',
  running: '||||',
  needs_input: '? ?',
  ready: '★ ★',
  blocked: 'X X',
  dragging: '> <',
  waving: '^ ~',
  sleeping: '- -',
  thinking: '• • •',
};

/**
 * Reference design palette (hex colors and role tokens).
 */
export const REFERENCE_PALETTE = {
  // White/Blue Chassis
  CHASSIS_WHITE: '#FFFFFF',
  CHASSIS_WHITE_SHADOW: '#CBD5E1',
  CHASSIS_BLUE_DARK: '#1E3A8A',
  CHASSIS_BLUE_PRIMARY: '#2563EB',
  CHASSIS_BLUE_LIGHT: '#3B82F6',

  // Glowing Cyan LED Screen & Eyes
  SCREEN_CYAN_GLOW: '#00FFFF',
  SCREEN_CYAN_LIGHT: '#22D3EE',
  SCREEN_CYAN_DARK: '#06B6D4',
  SCREEN_BG: '#0B192C',

  // Chest Star Emblem (4-pointed)
  CHEST_STAR_CYAN: '#00FFFF',
  CHEST_STAR_CENTER: '#E0F2FE',
  CHEST_STAR_BORDER: '#0284C7',

  // Detached Floating Hands
  HAND_WHITE: '#FFFFFF',
  HAND_ACCENT: '#60A5FA',
  HAND_SHADOW: '#1E40AF',

  // Cyan Anti-Gravity Ring & Particle Glow
  RING_CYAN_GLOW: '#00F0FF',
  RING_CYAN_PULSE: '#06B6D4',
  RING_PARTICLE: '#67E8F9',
  RING_CORE: '#0891B2',

  // Transparency
  TRANSPARENT: 'rgba(0,0,0,0)',
} as const;

/**
 * Window specifications for the Electron overlay.
 */
export const WINDOW_SPEC = {
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,
} as const;

/**
 * Audio presets spec contracts for procedural synthesizer.
 */
export const AUDIO_PRESETS = {
  state_change: { type: 'sine', startFreq: 440, endFreq: 660, duration: 0.12 },
  ready: { type: 'triangle', chord: [523.25, 659.25, 783.99, 1046.50], duration: 0.35 },
  blocked: { type: 'sawtooth', startFreq: 220, endFreq: 110, duration: 0.25 },
  needs_input: { type: 'sine', chime: [587.33, 880.00], duration: 0.2 },
  wave: { type: 'sine', startFreq: 700, endFreq: 950, duration: 0.15 },
  drag: { type: 'noise', startFreq: 500, endFreq: 1400, duration: 0.18 },
  chirp: { type: 'triangle', startFreq: 587.33, endFreq: 1174.66, duration: 0.15 },
} as const;

/**
 * Validates a PetConfig object against the specification schema.
 */
export function validatePetConfig(config: unknown): { valid: boolean; error?: string } {
  if (typeof config !== 'object' || config === null) {
    return { valid: false, error: 'Config must be a non-null object' };
  }
  const c = config as Record<string, unknown>;
  if (typeof c.x !== 'number' || !Number.isFinite(c.x)) {
    return { valid: false, error: 'x coordinate must be a finite number' };
  }
  if (typeof c.y !== 'number' || !Number.isFinite(c.y)) {
    return { valid: false, error: 'y coordinate must be a finite number' };
  }
  if (!SUPPORTED_SCALES.includes(c.scale as PetScale)) {
    return { valid: false, error: `scale must be one of [${SUPPORTED_SCALES.join(', ')}], got ${c.scale}` };
  }
  if (typeof c.isMuted !== 'boolean') {
    return { valid: false, error: 'isMuted must be a boolean' };
  }
  if (c.parentPid !== undefined && (typeof c.parentPid !== 'number' || c.parentPid <= 0)) {
    return { valid: false, error: 'parentPid must be a positive integer if provided' };
  }
  if (c.wsPort !== undefined && (typeof c.wsPort !== 'number' || c.wsPort < 1024 || c.wsPort > 65535)) {
    return { valid: false, error: 'wsPort must be between 1024 and 65535 if provided' };
  }
  return { valid: true };
}

/**
 * Validates a StatePayload object.
 */
export function validateStatePayload(payload: unknown): { valid: boolean; error?: string } {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, error: 'Payload must be a non-null object' };
  }
  const p = payload as Record<string, unknown>;
  if (!ALL_AGENT_STATES.includes(p.state as AgentState)) {
    return { valid: false, error: `Invalid state: ${p.state}` };
  }
  if (typeof p.summary !== 'string' || p.summary.length === 0) {
    return { valid: false, error: 'Summary must be a non-empty string' };
  }
  if (typeof p.timestamp !== 'number' || p.timestamp <= 0) {
    return { valid: false, error: 'Timestamp must be a positive number' };
  }
  return { valid: true };
}

/**
 * Validates IPC message envelopes.
 */
export function validateIPCMessage(msg: unknown, direction: 'client-to-server' | 'server-to-client'): { valid: boolean; error?: string } {
  if (typeof msg !== 'object' || msg === null) {
    return { valid: false, error: 'Message must be a non-null object' };
  }
  const m = msg as Record<string, unknown>;
  if (direction === 'client-to-server') {
    const validClientTypes = ['focus_ide', 'pet_ready', 'pet_close', 'config_update'];
    if (!validClientTypes.includes(m.type as string)) {
      return { valid: false, error: `Invalid client message type: ${m.type}` };
    }
  } else if (direction === 'server-to-client') {
    const validServerTypes = ['state_update', 'config_update', 'heartbeat', 'ack'];
    if (!validServerTypes.includes(m.type as string)) {
      return { valid: false, error: `Invalid server message type: ${m.type}` };
    }
    if (m.type === 'state_update') {
      const stateValidation = validateStatePayload(m.payload);
      if (!stateValidation.valid) {
        return stateValidation;
      }
    }
  }
  return { valid: true };
}
