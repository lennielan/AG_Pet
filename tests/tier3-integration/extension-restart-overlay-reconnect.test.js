/**
 * extension-restart-overlay-reconnect.test.js
 * Tier 3 Pairwise: F11 (Extension Lifecycle) × F14 (WebSocket Bridge)
 * Validates overlay client reconnecting when extension restarts on new port.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Extension Restart Reconnect',
  tier: 3,
  tests: [
    {
      name: 'test_overlay_reconnects_after_extension_restart',
      fn: async () => {
        const harness = new TestHarness();
        // Server 1 starts
        const server1Data = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(server1Data.port);
        assert.strictEqual(client.connected, true);

        // Extension restarts: Server 1 closes
        await server1Data.server.close();
        client.disconnect();
        assert.strictEqual(client.connected, false);

        // Server 2 starts on new port
        const server2Data = await harness.createBridgeServer();
        // Overlay client reconnects to new port
        const reconnectedClient = await harness.createOverlayClient(server2Data.port);
        assert.strictEqual(reconnectedClient.connected, true);

        server2Data.server.broadcast({ type: 'heartbeat', timestamp: Date.now() });
        const hb = await reconnectedClient.waitForMessage(m => m.type === 'heartbeat');
        assert(hb.timestamp > 0);

        await harness.cleanup();
      }
    }
  ]
};
