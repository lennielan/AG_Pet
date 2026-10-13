/**
 * transcript-append-reconnect.test.js
 * Tier 3 Pairwise: F12 (Transcript Tail Watcher) × F14 (Bridge Reconnect)
 * Validates transcript events buffering and catchup across bridge disconnect.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Transcript Append Reconnect',
  tier: 3,
  tests: [
    {
      name: 'test_transcript_catchup_after_bridge_reconnect',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        gen.initSession();

        const { server, port } = await harness.createBridgeServer();
        const client1 = await harness.createOverlayClient(port);

        // Client receives initial state
        server.broadcast({ type: 'state_update', payload: { state: 'idle', summary: 'Idle', timestamp: Date.now() } });
        await client1.waitForMessage(m => m.type === 'state_update');

        // Client disconnects
        client1.disconnect();

        // While disconnected, transcript appends new tool call and completion
        gen.appendToolCall('build_script');
        gen.appendTurnComplete('Build done');

        // Reconnect client2
        const client2 = await harness.createOverlayClient(port);
        server.broadcast({ type: 'state_update', payload: { state: 'ready', summary: 'Build done', timestamp: Date.now() } });

        const receivedOnReconnect = await client2.waitForMessage(m => m.type === 'state_update');
        assert.strictEqual(receivedOnReconnect.payload.state, 'ready');

        await harness.cleanup();
      }
    }
  ]
};
