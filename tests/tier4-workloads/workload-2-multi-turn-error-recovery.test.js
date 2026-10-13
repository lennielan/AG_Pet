/**
 * workload-2-multi-turn-error-recovery.test.js
 * Tier 4 Workload 2: Multi-Turn Error Recovery Session
 * Idle → Running → Tool exception (X X) blocked → User click focus → Fixed → Ready.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'Workload 2: Multi-Turn Error Recovery Session',
  tier: 4,
  tests: [
    {
      name: 'test_multi_turn_error_recovery_workflow',
      fn: async () => {
        const harness = new TestHarness('Workload 2');
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        const sm = TestHarness.createAnimationStateMachine('idle');
        const audio = TestHarness.createAudioSynthModel(false);

        // 1. Agent starts compilation task
        sm.transitionTo('running', 'Compiling project targets');
        server.broadcast({
          type: 'state_update',
          payload: { state: 'running', summary: 'Compiling project targets', timestamp: Date.now() }
        });
        await client.waitForMessage(m => m.payload?.state === 'running');

        // 2. Fatal build error encountered -> blocked
        sm.transitionTo('blocked', 'Blocked: TypeScript compiler syntax error in src/index.ts');
        const errorSound = audio.playSound('blocked');
        server.broadcast({
          type: 'state_update',
          payload: { state: 'blocked', summary: 'Blocked: TypeScript syntax error', timestamp: Date.now() }
        });
        const blockedMsg = await client.waitForMessage(m => m.payload?.state === 'blocked');

        assert.strictEqual(sm.getState(), 'blocked');
        assert.strictEqual(sm.getScreenExpression(), 'X X');
        assert.strictEqual(blockedMsg.payload.state, 'blocked');
        assert.strictEqual(errorSound.effectiveGain, 0.3);

        // 3. User clicks on pet to bring Antigravity IDE into foreground focus
        const serverFocusPromise = new Promise((resolve) => {
          server.once('message', (msg) => resolve(msg));
        });
        client.send({ type: 'focus_ide' });
        const focusMsg = await serverFocusPromise;
        assert.strictEqual(focusMsg.type, 'focus_ide', 'Click on pet must dispatch focus_ide message');

        // 4. User provides fix in IDE -> agent resumes running
        sm.transitionTo('running', 'Applying patch to src/index.ts');
        audio.playSound('state_change');

        // 5. Build passes and tests succeed -> ready
        sm.transitionTo('ready', 'Build passed with 0 errors');
        const readyChime = audio.playSound('ready');
        assert.strictEqual(sm.getState(), 'ready');
        assert.strictEqual(sm.getScreenExpression(), '★ ★');
        assert.strictEqual(readyChime.effectiveGain, 0.3);

        await harness.cleanup();
      }
    }
  ]
};
