/**
 * test-harness.js
 * Unified E2E Test Harness aggregating all mocks, validators,
 * contract models, and lifecycle tracking.
 */

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const contracts = require('./spec-contracts');
const PixelValidator = require('./pixel-validator');
const MockTranscriptGenerator = require('./mock-transcript');
const MockAntigravityProcess = require('./mock-process');
const { MinimalWebSocketServer, MockOverlayClient } = require('./mock-overlay');

class TestHarness {
  constructor(suiteName = 'Test Suite') {
    this.suiteName = suiteName;
    this.cleanups = [];
  }

  // --- Mock Factory Helpers ---

  createTranscriptGenerator(options = {}) {
    const gen = new MockTranscriptGenerator(options);
    this.cleanups.push(() => gen.cleanup());
    return gen;
  }

  createMockProcess() {
    const proc = new MockAntigravityProcess();
    this.cleanups.push(() => proc.cleanup());
    return proc;
  }

  async createBridgeServer(port = 0) {
    const server = new MinimalWebSocketServer();
    const actualPort = await server.listen(port);
    this.cleanups.push(async () => await server.close());
    return { server, port: actualPort };
  }

  async createOverlayClient(port) {
    const client = new MockOverlayClient(port);
    await client.connect();
    this.cleanups.push(() => client.disconnect());
    return client;
  }

  createTempDir(prefix = 'ag-pet-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    this.cleanups.push(() => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {}
    });
    return dir;
  }

  // --- Reference Oracle Models for Feature Validation ---

  static get contracts() {
    return contracts;
  }

  static get PixelValidator() {
    return PixelValidator;
  }

  static get MockProcess() {
    return MockAntigravityProcess;
  }

  static createMockProcess() {
    return new MockAntigravityProcess();
  }

  /**
   * Reference state machine model for F02 / F13.
   */
  static createAnimationStateMachine(initialState = 'idle') {
    let currentState = initialState;
    const history = [initialState];

    return {
      getState: () => currentState,
      getHistory: () => [...history],
      getScreenExpression: () => contracts.SCREEN_EXPRESSIONS[currentState] || '^ ^',
      transitionTo: (newState, summary = '') => {
        if (!contracts.VALID_AGENT_STATES.includes(newState)) {
          throw new Error(`Invalid state transition to: ${newState}`);
        }
        currentState = newState;
        history.push(newState);
        return {
          state: currentState,
          summary,
          expression: contracts.SCREEN_EXPRESSIONS[currentState],
          timestamp: Date.now()
        };
      }
    };
  }

  /**
   * Reference Audio Synthesizer model for F04.
   */
  static createAudioSynthModel(initialMuted = false) {
    let isMuted = initialMuted;
    const playedSounds = [];

    return {
      isMuted: () => isMuted,
      setMuted: (muted) => { isMuted = !!muted; },
      toggleMute: () => { isMuted = !isMuted; return isMuted; },
      playSound: (soundKey) => {
        const preset = contracts.AUDIO_PRESETS[soundKey];
        if (!preset) {
          throw new Error(`Unknown audio preset: ${soundKey}`);
        }
        const record = {
          soundKey,
          preset,
          effectiveGain: isMuted ? 0.0 : 0.3,
          timestamp: Date.now()
        };
        playedSounds.push(record);
        return record;
      },
      getHistory: () => [...playedSounds]
    };
  }

  /**
   * Reference Drag & Multi-Monitor persistence model for F06.
   */
  static createDragPersistModel(initialConfig = { x: 100, y: 100, scale: 1.0, isMuted: false }) {
    let config = { ...initialConfig };
    let isDragging = false;
    let dragStartPos = null;

    return {
      getConfig: () => ({ ...config }),
      startDrag: (mouseX, mouseY) => {
        isDragging = true;
        dragStartPos = { mouseX, mouseY, initialX: config.x, initialY: config.y };
      },
      dragMove: (mouseX, mouseY) => {
        if (!isDragging || !dragStartPos) return;
        const deltaX = mouseX - dragStartPos.mouseX;
        const deltaY = mouseY - dragStartPos.mouseY;
        config.x = dragStartPos.initialX + deltaX;
        config.y = dragStartPos.initialY + deltaY;
      },
      endDrag: (savePath = null) => {
        isDragging = false;
        dragStartPos = null;
        if (savePath) {
          fs.writeFileSync(savePath, JSON.stringify(config, null, 2), 'utf8');
        }
        return { ...config };
      },
      loadConfig: (filePath) => {
        if (!fs.existsSync(filePath)) {
          return config;
        }
        try {
          const loaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const validation = contracts.validatePetConfig(loaded);
          if (validation.valid) {
            config = { ...config, ...loaded };
          }
        } catch (e) {}
        return { ...config };
      }
    };
  }

  /**
   * Reference Transcript Extractor model for F12 / F13.
   */
  static parseTranscriptLine(line) {
    if (!line || typeof line !== 'string') return null;
    const trimmed = line.trim();
    if (!trimmed) return null;

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch (e) {
      return { type: 'corrupted', raw: trimmed };
    }

    if (obj.blocked || (obj.error && obj.error.code)) {
      return {
        state: 'blocked',
        summary: obj.summary || `Blocked: ${obj.error.message || 'error'}`,
        timestamp: Date.now()
      };
    }

    if (obj.prompt_user || obj.question) {
      return {
        state: 'needs_input',
        summary: obj.summary || 'Awaiting user input',
        timestamp: Date.now()
      };
    }

    if (obj.turn_complete) {
      return {
        state: 'ready',
        summary: obj.summary || 'Task completed successfully',
        timestamp: Date.now()
      };
    }

    if (obj.tool_calls && Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
      const toolName = obj.tool_calls[0].function?.name || obj.tool_calls[0].name || 'tool';
      return {
        state: 'running',
        summary: `Running tool: ${toolName}`,
        timestamp: Date.now(),
        metadata: { toolName }
      };
    }

    if (obj.thinking) {
      return {
        state: 'running',
        summary: 'Thinking...',
        timestamp: Date.now()
      };
    }

    if (obj.role === 'user') {
      return {
        state: 'running',
        summary: 'Processing request...',
        timestamp: Date.now()
      };
    }

    return null;
  }

  // --- Teardown Helper ---

  async cleanup() {
    for (const fn of this.cleanups.reverse()) {
      try {
        await fn();
      } catch (e) {}
    }
    this.cleanups = [];
  }
}

module.exports = TestHarness;
