/**
 * tests/empirical/test-bridge-reconnect.js
 * Empirical Stress Test: WebSocket Server Bridge Connection Drop & Reconnection
 *
 * Verifies:
 * 1. Initial WebSocket handshake and bidirectional message passing.
 * 2. Server-side socket drop triggers client auto-reconnection.
 * 3. Complete server restart on same port: client survives downtime, reconnects,
 *    and flushes queued offline messages.
 * 4. Post-reconnect bidirectional messaging integrity.
 * 5. Clean explicit disconnection terminates cleanly without reconnection loops.
 */

const assert = require('node:assert');
const path = require('node:path');
const { ServerBridge } = require(path.resolve(__dirname, '../../extension/dist/extension/src/server-bridge.js'));
const { ClientBridge } = require(path.resolve(__dirname, '../../desktop-overlay/dist/desktop-overlay/main/client-bridge.js'));

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
  console.log(' EMPIRICAL TEST: WEBSOCKET BRIDGE CONNECTION DROP & RECONNECTION');
  console.log('='.repeat(78));

  // 1. Setup Server & Client
  console.log('\n[Phase 1] Establishing initial ServerBridge <-> ClientBridge connection...');
  let server = new ServerBridge();
  const port = await server.listen(0);
  console.log(`  Bridge server listening on ephemeral port ${port}`);

  const client = new ClientBridge({
    port,
    host: '127.0.0.1',
    autoConnect: false,
    reconnectIntervalMs: 80,
    maxReconnectAttempts: 15,
  });

  const clientErrors = [];
  client.on('error', (err) => {
    clientErrors.push(err);
  });

  const connectPromise = waitForEvent(client, 'connected', 2000);
  await client.connect();
  await connectPromise;

  assert.strictEqual(client.isConnected(), true, 'Client must be connected');
  assert.strictEqual(server.getClientCount(), 1, 'Server must have 1 connected client');
  console.log('  ✔ Handshake verified. 1 client connected.');

  // Verify initial bidirectional messaging
  {
    const serverMsgPromise = waitForEvent(server, 'focus_ide', 2000);
    client.sendFocusRequest();
    await serverMsgPromise;

    const clientMsgPromise = waitForEvent(client, 'state_update', 2000);
    server.broadcast({
      state: 'running',
      summary: 'Initial verification',
      timestamp: Date.now()
    });
    const state = await clientMsgPromise;
    assert.strictEqual(state.state, 'running', 'Client must receive initial state update');
    console.log('  ✔ Initial bidirectional message exchange confirmed.');
  }

  // 2. Scenario A: Abrupt socket destruction by server
  console.log('\n[Phase 2] Simulating server-side socket destruction (connection drop)...');
  {
    const disconnectPromise = waitForEvent(client, 'disconnected', 2000);
    const reconnectPromise = waitForEvent(client, 'connected', 3000);

    // Forcefully destroy client socket on server side
    const sockets = Array.from(server.getClients());
    assert(sockets.length > 0, 'Must have at least one socket on server');
    sockets[0].destroy();

    await disconnectPromise;
    assert.strictEqual(client.isConnected(), false, 'Client must detect disconnection');
    console.log('  ✔ Client detected abrupt socket closure.');

    // Wait for client auto-reconnect
    await reconnectPromise;
    assert.strictEqual(client.isConnected(), true, 'Client must reconnect automatically');
    assert.strictEqual(server.getClientCount(), 1, 'Server must register reconnected client');
    console.log('  ✔ Client auto-reconnected successfully after socket drop.');

    // Verify post-reconnect messaging
    const clientStatePromise = waitForEvent(client, 'state_update', 2000);
    server.broadcast({
      state: 'ready',
      summary: 'Post-reconnect test',
      timestamp: Date.now()
    });
    const postState = await clientStatePromise;
    assert.strictEqual(postState.state, 'ready');
    console.log('  ✔ Post-reconnect bidirectional communication verified.');
  }

  // 3. Scenario B: Full server shutdown, offline message queuing, and server restart
  console.log('\n[Phase 3] Simulating full server shutdown, offline queuing, and server restart on same port...');
  {
    const disconnectPromise = waitForEvent(client, 'disconnected', 2000);
    await server.close();
    await disconnectPromise;
    assert.strictEqual(client.isConnected(), false, 'Client must be disconnected when server closes');
    console.log('  ✔ Server closed. Client is in reconnect loop.');

    // Enqueue messages while offline
    console.log('  Queueing messages while bridge is offline...');
    const send1 = client.sendFocusRequest(); // type: 'focus_ide'
    const send2 = client.sendPetReady();     // type: 'pet_ready'
    // Returns false because client is not connected and enqueued into pendingQueue
    assert.strictEqual(send1, false, 'send() must return false and enqueue when disconnected');
    assert.strictEqual(send2, false, 'send() must return false and enqueue when disconnected');

    // Wait 250ms during offline period
    await sleep(250);

    // Restart server on SAME port
    console.log(`  Restarting new ServerBridge on same port ${port}...`);
    const newServer = new ServerBridge();

    // Prepare to capture the queued messages that will be flushed upon reconnect
    const receivedMessages = [];
    newServer.on('message', (msg) => {
      receivedMessages.push(msg.type);
    });

    const clientReconnectPromise = waitForEvent(client, 'connected', 4000);
    await newServer.listen(port);

    await clientReconnectPromise;
    assert.strictEqual(client.isConnected(), true, 'Client must reconnect to restarted server');
    console.log('  ✔ Client reconnected to restarted server.');

    // Wait a brief moment for pending queue to flush
    await sleep(150);

    assert(receivedMessages.includes('focus_ide'), 'Queued focus_ide message must be delivered after reconnect');
    assert(receivedMessages.includes('pet_ready'), 'Queued pet_ready message must be delivered after reconnect');
    console.log(`  ✔ Offline queued messages successfully flushed and received: [${receivedMessages.join(', ')}]`);

    // Verify subsequent state update on new server
    const statePromise = waitForEvent(client, 'state_update', 2000);
    newServer.broadcast({
      state: 'needs_input',
      summary: 'Prompting after server restart',
      timestamp: Date.now()
    });
    const finalState = await statePromise;
    assert.strictEqual(finalState.state, 'needs_input');
    console.log('  ✔ Real-time streaming confirmed on restored bridge.');

    server = newServer;
  }

  // 4. Scenario C: Clean explicit client disconnection
  console.log('\n[Phase 4] Testing clean explicit client disconnection...');
  {
    client.disconnect();
    assert.strictEqual(client.isConnected(), false, 'Client must be marked disconnected');

    // Wait 250ms to verify no spurious reconnect attempts are made
    await sleep(250);
    assert.strictEqual(client.isConnected(), false, 'Client must remain disconnected after explicit disconnect()');
    console.log('  ✔ Client disconnect is clean and idempotent.');

    await server.close();
  }

  console.log('\n' + '='.repeat(78));
  console.log(' ALL WEBSOCKET BRIDGE RECONNECTION EMPIRICAL TESTS PASSED');
  console.log('='.repeat(78) + '\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('✖ Empirical Bridge Reconnection Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
