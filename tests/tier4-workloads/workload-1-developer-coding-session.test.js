/**
 * workload-1-developer-coding-session.test.js
 * Tier 4 Workload 1: Full Developer Coding Session
 * Startup → Idle → Running with tools → Input prompt → Running fix → Completion flip (★ ★).
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'Workload 1: Full Developer Coding Session',
  tier: 4,
  tests: [
    {
      name: 'test_full_developer_coding_session_lifecycle',
      fn: async () => {
        const harness = new TestHarness('Workload 1');

        // 1. Antigravity IDE launches & allocates bridge
        const { server, port } = await harness.createBridgeServer();
        const proc = harness.createMockProcess();
        const { pid: idePid } = await proc.spawn();

        // 2. Extension activates and spawns overlay client
        const client = await harness.createOverlayClient(port);
        const sm = TestHarness.createAnimationStateMachine('idle');
        const audio = TestHarness.createAudioSynthModel(false);

        assert.strictEqual(sm.getState(), 'idle');
        assert.strictEqual(sm.getScreenExpression(), '^ ^');

        // 3. User types prompt -> agent starts processing
        const transcriptGen = harness.createTranscriptGenerator();
        transcriptGen.initSession();
        transcriptGen.appendUserInput('Refactor database queries for performance');

        sm.transitionTo('running', 'Thinking...');
        server.broadcast({
          type: 'state_update',
          payload: { state: 'running', summary: 'Thinking...', timestamp: Date.now() }
        });
        const msgRunning = await client.waitForMessage(m => m.payload?.state === 'running');
        assert.strictEqual(msgRunning.payload.summary, 'Thinking...');
        assert.strictEqual(sm.getScreenExpression(), '||||');

        // 4. Agent calls tool -> search_files
        transcriptGen.appendToolCall('search_files');
        audio.playSound('state_change');

        // 5. Agent prompts user for confirmation -> needs_input
        transcriptGen.appendPromptUser('Confirm database migration script?');
        sm.transitionTo('needs_input', 'Confirm database migration script?');
        audio.playSound('needs_input');
        assert.strictEqual(sm.getScreenExpression(), '? ?');

        // 6. User approves, agent executes write_to_file
        transcriptGen.appendUserInput('Yes, proceed');
        sm.transitionTo('running', 'Writing migration script');
        audio.playSound('state_change');

        // 7. Turn completes successfully -> ready
        transcriptGen.appendTurnComplete('Migration applied successfully');
        sm.transitionTo('ready', 'Migration applied successfully');
        const readyChime = audio.playSound('ready');

        assert.strictEqual(sm.getState(), 'ready');
        assert.strictEqual(sm.getScreenExpression(), '★ ★');
        assert.strictEqual(readyChime.effectiveGain, 0.3);

        // 8. Return to idle
        sm.transitionTo('idle', 'Awaiting next instruction');
        assert.strictEqual(sm.getState(), 'idle');
        assert.strictEqual(sm.getScreenExpression(), '^ ^');

        await harness.cleanup();
      }
    }
  ]
};
