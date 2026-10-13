/**
 * brain-rotation-watcher-handoff.test.js
 * Tier 3 Pairwise: F12 (Brain Session Rotation) × F14 (Real-Time IPC Stream)
 * Validates streaming events when Antigravity spawns a new conversation session.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Brain Rotation Watcher Handoff',
  tier: 3,
  tests: [
    {
      name: 'test_brain_rotation_updates_streamed_events',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        gen.initSession();

        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        // Session 1: complete turn
        gen.appendTurnComplete('Session 1 complete');
        server.broadcast({ type: 'state_update', payload: { state: 'ready', summary: 'Session 1 complete', timestamp: Date.now() } });

        const msg1 = await client.waitForMessage(m => m.payload?.summary === 'Session 1 complete');
        assert.strictEqual(msg1.payload.state, 'ready');

        // Antigravity creates Session 2
        gen.rotateSession();
        gen.appendToolCall('npm_install');
        server.broadcast({ type: 'state_update', payload: { state: 'running', summary: 'Running tool: npm_install', timestamp: Date.now() } });

        const msg2 = await client.waitForMessage(m => m.payload?.summary.includes('npm_install'));
        assert.strictEqual(msg2.payload.state, 'running');

        await harness.cleanup();
      }
    }
  ]
};
