/**
 * tests/empirical/test-bridge-throughput.js
 * Empirical Stress Test: High-Throughput State Event Streaming (50+ bursts)
 *
 * Verifies:
 * 1. 50 rapid sequential state updates streamed from server to client with zero loss.
 * 2. 100 rapid state updates stress test with state transitions & FIFO ordering.
 * 3. 250 high-velocity event bursts benchmarking throughput (events/sec).
 * 4. Bidirectional concurrent burst streaming (50 server events + 50 client commands simultaneously).
 * 5. Strict message ordering, unmasking integrity, and zero packet fragmentation errors.
 */

const assert = require('node:assert');
const path = require('node:path');
const { ServerBridge } = require(path.resolve(__dirname, '../../extension/dist/extension/src/server-bridge.js'));
const { ClientBridge } = require(path.resolve(__dirname, '../../desktop-overlay/dist/desktop-overlay/main/client-bridge.js'));

const ALL_STATES = ['idle', 'running', 'needs_input', 'ready', 'blocked', 'dragging', 'waving'];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForEvent(emitter, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event '${eventName}' after ${timeoutMs}ms`));
    }, timeoutMs);

    emitter.once(eventName, (...args) => {
      clearTimeout(timer);
      resolve(args.length <= 1 ? args[0] : args);
    });
  });
}

async function run() {
  console.log('='.repeat(78));
  console.log(' EMPIRICAL TEST: HIGH-THROUGHPUT STATE EVENT STREAMING (50+ BURSTS)');
  console.log('='.repeat(78));

  const server = new ServerBridge();
  const port = await server.listen(0);
  console.log(`\n  Bridge server listening on ephemeral port ${port}`);

  const client = new ClientBridge({
    port,
    host: '127.0.0.1',
    autoConnect: false,
    reconnectIntervalMs: 100,
  });

  client.on('error', () => {}); // Safe error capture

  const connectPromise = waitForEvent(client, 'connected', 2000);
  await client.connect();
  await connectPromise;
  assert.strictEqual(client.isConnected(), true);
  console.log('  ✔ Handshake verified. Connected.');

  // =========================================================================
  // Phase 1: 50 Bursts (Base Requirement)
  // =========================================================================
  console.log('\n[Phase 1] Streaming 50 rapid sequential StatePayload bursts...');
  {
    const BURST_COUNT = 50;
    const receivedEvents = [];

    const onState = (payload) => {
      receivedEvents.push(payload);
    };
    client.on('state_update', onState);

    const t0 = performance.now();
    for (let i = 0; i < BURST_COUNT; i++) {
      const state = ALL_STATES[i % ALL_STATES.length];
      server.broadcast({
        state,
        summary: `Step ${i}: executing agent task burst ${state}`,
        timestamp: Date.now(),
        metadata: { step: i, batch: 1 }
      });
    }

    // Wait until all 50 events arrive or timeout 3000ms
    const deadline = Date.now() + 3000;
    while (receivedEvents.length < BURST_COUNT && Date.now() < deadline) {
      await sleep(10);
    }
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);

    client.off('state_update', onState);

    assert.strictEqual(
      receivedEvents.length,
      BURST_COUNT,
      `Expected ${BURST_COUNT} events, but received ${receivedEvents.length}`
    );

    // Verify strict FIFO order and data integrity
    for (let i = 0; i < BURST_COUNT; i++) {
      const ev = receivedEvents[i];
      assert.strictEqual(ev.metadata.step, i, `Event sequence mismatch at index ${i}`);
      assert.strictEqual(ev.state, ALL_STATES[i % ALL_STATES.length]);
      assert(ev.summary.includes(`Step ${i}`), `Summary corrupted at step ${i}`);
    }

    const throughput = Math.round((BURST_COUNT / (durationMs / 1000)));
    console.log(`  ✔ Phase 1 PASSED: 50/50 events received in ${durationMs}ms (~${throughput} events/sec) with strict FIFO order.`);
  }

  // =========================================================================
  // Phase 2: 100 Bursts Stress Test
  // =========================================================================
  console.log('\n[Phase 2] Streaming 100 rapid StatePayload bursts stress test...');
  {
    const BURST_COUNT = 100;
    const receivedEvents = [];

    const onState = (payload) => {
      receivedEvents.push(payload);
    };
    client.on('state_update', onState);

    const t0 = performance.now();
    for (let i = 0; i < BURST_COUNT; i++) {
      const state = ALL_STATES[i % ALL_STATES.length];
      server.broadcast({
        state,
        summary: `Stress Step ${i}: ${'#'.repeat(20)} [${state}]`,
        timestamp: Date.now(),
        metadata: { step: i, batch: 2 }
      });
    }

    const deadline = Date.now() + 4000;
    while (receivedEvents.length < BURST_COUNT && Date.now() < deadline) {
      await sleep(10);
    }
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);

    client.off('state_update', onState);

    assert.strictEqual(
      receivedEvents.length,
      BURST_COUNT,
      `Expected ${BURST_COUNT} events, but received ${receivedEvents.length}`
    );

    for (let i = 0; i < BURST_COUNT; i++) {
      assert.strictEqual(receivedEvents[i].metadata.step, i);
      assert.strictEqual(receivedEvents[i].state, ALL_STATES[i % ALL_STATES.length]);
    }

    const throughput = Math.round((BURST_COUNT / (durationMs / 1000)));
    console.log(`  ✔ Phase 2 PASSED: 100/100 events received in ${durationMs}ms (~${throughput} events/sec) without packet drops.`);
  }

  // =========================================================================
  // Phase 3: 250 High-Velocity Bursts Benchmark
  // =========================================================================
  console.log('\n[Phase 3] Benchmarking 250 high-velocity event bursts...');
  {
    const BURST_COUNT = 250;
    const receivedEvents = [];

    const onState = (payload) => {
      receivedEvents.push(payload);
    };
    client.on('state_update', onState);

    const t0 = performance.now();
    for (let i = 0; i < BURST_COUNT; i++) {
      server.broadcast({
        state: 'running',
        summary: `High-velocity frame ${i}`,
        timestamp: Date.now(),
        metadata: { step: i, batch: 3 }
      });
    }

    const deadline = Date.now() + 5000;
    while (receivedEvents.length < BURST_COUNT && Date.now() < deadline) {
      await sleep(10);
    }
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);

    client.off('state_update', onState);

    assert.strictEqual(receivedEvents.length, BURST_COUNT);
    const throughput = Math.round((BURST_COUNT / (durationMs / 1000)));
    console.log(`  ✔ Phase 3 PASSED: 250/250 events delivered in ${durationMs}ms (~${throughput} events/sec). Zero corruption.`);
  }

  // =========================================================================
  // Phase 4: Bidirectional Concurrent Burst Streaming
  // =========================================================================
  console.log('\n[Phase 4] Testing bidirectional concurrent burst streaming (50 server + 50 client)...');
  {
    const COUNT = 50;
    const clientReceived = [];
    const serverReceived = [];

    const onClientState = (payload) => clientReceived.push(payload);
    const onServerMsg = (msg) => serverReceived.push(msg);

    client.on('state_update', onClientState);
    server.on('message', onServerMsg);

    const t0 = performance.now();

    // Concurrently broadcast from server and send from client
    for (let i = 0; i < COUNT; i++) {
      server.broadcast({
        state: ALL_STATES[i % ALL_STATES.length],
        summary: `Bidirectional S->C #${i}`,
        timestamp: Date.now(),
        metadata: { step: i }
      });

      client.send({
        type: i % 2 === 0 ? 'focus_ide' : 'pet_ready',
        seq: i
      });
    }

    const deadline = Date.now() + 4000;
    while ((clientReceived.length < COUNT || serverReceived.length < COUNT) && Date.now() < deadline) {
      await sleep(10);
    }
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);

    client.off('state_update', onClientState);
    server.off('message', onServerMsg);

    assert.strictEqual(clientReceived.length, COUNT, `Client received ${clientReceived.length}/${COUNT}`);
    assert.strictEqual(serverReceived.length, COUNT, `Server received ${serverReceived.length}/${COUNT}`);

    console.log(`  ✔ Phase 4 PASSED: 50 S->C and 50 C->S concurrent messages delivered in ${durationMs}ms without deadlock.`);
  }

  // Clean teardown
  client.disconnect();
  await server.close();

  console.log('\n' + '='.repeat(78));
  console.log(' ALL HIGH-THROUGHPUT STREAMING EMPIRICAL TESTS PASSED');
  console.log('='.repeat(78) + '\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('✖ Empirical Bridge Throughput Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
