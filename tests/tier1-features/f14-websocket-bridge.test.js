/**
 * f14-websocket-bridge.test.js
 * Feature 14: Real-Time IPC/WebSocket Bridge
 * Validates handshake, broadcast of state updates, client focus dispatch,
 * heartbeat messaging, and clean disconnection.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'F14: Real-Time IPC/WebSocket Bridge',
  tier: 1,
  tests: [
    {
      name: 'test_websocket_handshake',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        assert.strictEqual(client.connected, true);
        assert.strictEqual(server.clients.size, 1);

        await harness.cleanup();
      }
    },
    {
      name: 'test_server_broadcasts_state_update',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        const updateMsg = {
          type: 'state_update',
          payload: {
            state: 'running',
            summary: 'Compiling assets...',
            timestamp: Date.now()
          }
        };

        server.broadcast(updateMsg);

        const received = await client.waitForMessage(m => m.type === 'state_update');
        assert.strictEqual(received.payload.state, 'running');
        assert.strictEqual(received.payload.summary, 'Compiling assets...');

        await harness.cleanup();
      }
    },
    {
      name: 'test_client_sends_focus_message',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        const serverReceivedPromise = new Promise((resolve) => {
          server.once('message', (msg) => resolve(msg));
        });

        client.send({ type: 'focus_ide' });
        const receivedOnServer = await serverReceivedPromise;

        assert.strictEqual(receivedOnServer.type, 'focus_ide');

        await harness.cleanup();
      }
    },
    {
      name: 'test_heartbeat_ping_pong',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        server.broadcast({ type: 'heartbeat', timestamp: Date.now() });
        const received = await client.waitForMessage(m => m.type === 'heartbeat');
        assert(received.timestamp > 0);

        await harness.cleanup();
      }
    },
    {
      name: 'test_clean_disconnection',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        assert.strictEqual(server.clients.size, 1);
        client.disconnect();

        // Small wait for socket close event
        await new Promise(r => setTimeout(r, 60));
        assert.strictEqual(server.clients.size, 0);

        await harness.cleanup();
      }
    }
  ]
};
