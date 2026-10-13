/**
 * spec-contracts.js
 * Authoritative contracts, constants, schemas, and reference models
 * derived directly from ORIGINAL_REQUEST.md and PROJECT.md.
 */

const VALID_AGENT_STATES = [
  'idle',
  'running',
  'needs_input',
  'ready',
  'blocked',
  'dragging',
  'waving'
];

const VALID_SCALES = [1.0, 1.5, 2.0];

const REFERENCE_PALETTE = {
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
  TRANSPARENT: 'rgba(0,0,0,0)'
};

const SCREEN_EXPRESSIONS = {
  idle: '^ ^',
  running: '||||', // data stream
  needs_input: '? ?',
  ready: '★ ★',
  blocked: 'X X',
  dragging: '> <',
  waving: '^ ~',
  thinking: '• • •'
};

const WINDOW_SPEC = {
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false
};

const AUDIO_PRESETS = {
  state_change: { type: 'sine', startFreq: 440, endFreq: 660, duration: 0.12 },
  ready: { type: 'triangle', chord: [523.25, 659.25, 783.99, 1046.50], duration: 0.35 },
  blocked: { type: 'sawtooth', startFreq: 220, endFreq: 110, duration: 0.25 },
  needs_input: { type: 'sine', chime: [587.33, 880.00], duration: 0.2 },
  wave: { type: 'sine', startFreq: 700, endFreq: 950, duration: 0.15 }
};

/**
 * Validates a PetConfig object against the specification schema.
 */
function validatePetConfig(config) {
  if (typeof config !== 'object' || config === null) {
    return { valid: false, error: 'Config must be a non-null object' };
  }
  if (typeof config.x !== 'number' || !Number.isFinite(config.x)) {
    return { valid: false, error: 'x coordinate must be a finite number' };
  }
  if (typeof config.y !== 'number' || !Number.isFinite(config.y)) {
    return { valid: false, error: 'y coordinate must be a finite number' };
  }
  if (!VALID_SCALES.includes(config.scale)) {
    return { valid: false, error: `scale must be one of [${VALID_SCALES.join(', ')}], got ${config.scale}` };
  }
  if (typeof config.isMuted !== 'boolean') {
    return { valid: false, error: 'isMuted must be a boolean' };
  }
  if (config.parentPid !== undefined && (typeof config.parentPid !== 'number' || config.parentPid <= 0)) {
    return { valid: false, error: 'parentPid must be a positive integer if provided' };
  }
  if (config.wsPort !== undefined && (typeof config.wsPort !== 'number' || config.wsPort < 1024 || config.wsPort > 65535)) {
    return { valid: false, error: 'wsPort must be between 1024 and 65535 if provided' };
  }
  return { valid: true };
}

/**
 * Validates a StatePayload object.
 */
function validateStatePayload(payload) {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, error: 'Payload must be a non-null object' };
  }
  if (!VALID_AGENT_STATES.includes(payload.state) && !['sleeping', 'thinking'].includes(payload.state)) {
    return { valid: false, error: `Invalid state: ${payload.state}` };
  }
  if (typeof payload.summary !== 'string' || payload.summary.length === 0) {
    return { valid: false, error: 'Summary must be a non-empty string' };
  }
  if (typeof payload.timestamp !== 'number' || payload.timestamp <= 0) {
    return { valid: false, error: 'Timestamp must be a positive number' };
  }
  return { valid: true };
}

/**
 * Validates IPC message envelopes.
 */
function validateIPCMessage(msg, direction) {
  if (typeof msg !== 'object' || msg === null) {
    return { valid: false, error: 'Message must be a non-null object' };
  }
  if (direction === 'client-to-server') {
    const validClientTypes = ['focus_ide', 'pet_ready', 'pet_close'];
    if (!validClientTypes.includes(msg.type)) {
      return { valid: false, error: `Invalid client message type: ${msg.type}` };
    }
  } else if (direction === 'server-to-client') {
    const validServerTypes = ['state_update', 'config_update', 'heartbeat'];
    if (!validServerTypes.includes(msg.type)) {
      return { valid: false, error: `Invalid server message type: ${msg.type}` };
    }
    if (msg.type === 'state_update') {
      const stateValidation = validateStatePayload(msg.payload);
      if (!stateValidation.valid) {
        return stateValidation;
      }
    }
  }
  return { valid: true };
}

module.exports = {
  VALID_AGENT_STATES,
  VALID_SCALES,
  REFERENCE_PALETTE,
  SCREEN_EXPRESSIONS,
  WINDOW_SPEC,
  AUDIO_PRESETS,
  validatePetConfig,
  validateStatePayload,
  validateIPCMessage
};
