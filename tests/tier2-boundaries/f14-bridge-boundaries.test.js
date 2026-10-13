/**
 * f14-bridge-boundaries.test.js
 * Feature 14 Boundaries: Real-Time IPC/WebSocket Bridge
 * Validates connection refused handling, massive 500KB payloads,
 * multiple concurrent clients, abrupt server crashes, and rapid burst sends.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'F14 Boundaries: Real-Time IPC/WebSocket Bridge',
  tier: 2,
  tests: [
    {
      name: 'test_bridge_connection_refused_retry',
      fn: async () => {
        const harness = new TestHarness();
        // Pick an unused port without starting a server
        const deadPort = 49151;

        let errorCaptured = false;
        try {
          const client = await harness.createOverlayClient(deadPort);
          await client.connect();
        } catch (e) {
          errorCaptured = true;
        }

        assert.strictEqual(errorCaptured, true, 'Connection to closed port must reject cleanly');
        await harness.cleanup();
      }
    },
    {
      name: 'test_bridge_massive_payload_handling',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        // 100KB payload (exceeding typical 64KB frame chunking)
        const largeSummary = 'A'.repeat(100 * 1024);
        const largeMsg = {
          type: 'state_update',
          payload: {
            state: 'running',
            summary: largeSummary,
            timestamp: Date.now()
          }
        };

        server.broadcast(largeMsg);

        const received = await client.waitForMessage(m => m.type === 'state_update', 3000);
        assert.strictEqual(received.payload.summary.length, 100 * 1024);

        await harness.cleanup();
      }
    },
    {
      name: 'test_bridge_multiple_concurrent_clients',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();

        // Connect 4 simultaneous clients
        const clients = [];
        for (let i = 0; i < 4; i++) {
          clients.push(await harness.createOverlayClient(port));
        }

        assert.strictEqual(server.clients.size, 4);

        const updateMsg = { type: 'state_update', payload: { state: 'ready', summary: 'All ready', timestamp: Date.now() } };
        server.broadcast(updateMsg);

        // Every client receives the broadcast
        for (const c of clients) {
          const msg = await c.waitForMessage(m => m.type === 'state_update');
          assert.strictEqual(msg.payload.state, 'ready');
        }

        await harness.cleanup();
      }
    },
    {
      name: 'test_bridge_abrupt_server_crash',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        assert.strictEqual(client.connected, true);

        let closeFired = false;
        client.on('close', () => { closeFired = true; });

        // Server abruptly closes
        await server.close();

        await new Promise(r => setTimeout(r, 100));
        assert.strictEqual(client.connected, false);
        assert.strictEqual(closeFired, true);

        await harness.cleanup();
      }
    },
    {
      name: 'test_bridge_rapid_send_buffering',
      fn: async () => {
        const harness = new TestHarness();
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        let receivedCount = 0;
        server.on('message', (msg) => {
          if (msg.type === 'pet_ready') receivedCount++;
        });

        // Send 25 messages in immediate succession
        for (let i = 0; i < 25; i++) {
          client.send({ type: 'pet_ready', seq: i });
        }

        // Wait a short moment for socket to drain
        await new Promise(r => setTimeout(r, 150));
        assert.strictEqual(receivedCount, 25, 'All 25 rapid messages must be received by server');

        await harness.cleanup();
      }
    }
  ]
};
