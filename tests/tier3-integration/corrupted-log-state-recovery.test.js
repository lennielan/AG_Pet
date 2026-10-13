/**
 * corrupted-log-state-recovery.test.js
 * Tier 3 Pairwise: F12 (Corrupted Log Line) × F13 (State Machine Recovery)
 * Validates resilience when log file contains half-written JSON during crash.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Corrupted Log State Recovery',
  tier: 3,
  tests: [
    {
      name: 'test_recovery_from_corrupted_log_fragment',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('running');

        // Line 1: corrupt snippet
        const line1 = '{"role": "model", "tool_calls": [ {"broken": ';
        const parsed1 = TestHarness.parseTranscriptLine(line1);
        assert.strictEqual(parsed1.type, 'corrupted');
        // Machine does not crash, stays in running
        assert.strictEqual(sm.getState(), 'running');

        // Line 2: valid turn completion
        const line2 = JSON.stringify({ role: 'model', turn_complete: true, content: 'All finished' });
        const parsed2 = TestHarness.parseTranscriptLine(line2);
        assert.strictEqual(parsed2.state, 'ready');

        sm.transitionTo(parsed2.state, parsed2.summary);
        assert.strictEqual(sm.getState(), 'ready');
        assert.strictEqual(sm.getScreenExpression(), '★ ★');
      }
    }
  ]
};
