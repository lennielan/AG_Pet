/**
 * f13-state-boundaries.test.js
 * Feature 13 Boundaries: Agent State Machine Extraction
 * Validates empty lines, malformed JSON fallback, tool calls with missing names,
 * error state priority over turn completion, and unrecognized roles.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'F13 Boundaries: Agent State Machine Extraction',
  tier: 2,
  tests: [
    {
      name: 'test_state_extraction_empty_line',
      fn: async () => {
        assert.strictEqual(TestHarness.parseTranscriptLine(''), null);
        assert.strictEqual(TestHarness.parseTranscriptLine('   \n  \t '), null);
        assert.strictEqual(TestHarness.parseTranscriptLine(null), null);
      }
    },
    {
      name: 'test_state_extraction_malformed_json_fallback',
      fn: async () => {
        const result = TestHarness.parseTranscriptLine('{"role": "model", unclosed_syntax');
        assert.notStrictEqual(result, null);
        assert.strictEqual(result.type, 'corrupted');
      }
    },
    {
      name: 'test_state_extraction_tool_with_missing_name',
      fn: async () => {
        const line = JSON.stringify({
          role: 'model',
          tool_calls: [{ id: 'call_1' }] // missing function.name
        });
        const result = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(result.state, 'running');
        assert(result.summary.includes('tool'));
      }
    },
    {
      name: 'test_state_extraction_conflicting_flags',
      fn: async () => {
        // Line with both error and turn_complete (e.g. fatal error terminates turn)
        const line = JSON.stringify({
          role: 'system',
          error: { message: 'Out of memory', code: 'OOM' },
          blocked: true,
          turn_complete: true
        });
        const result = TestHarness.parseTranscriptLine(line);
        // Error state must take precedence!
        assert.strictEqual(result.state, 'blocked', 'Blocked error state must take precedence over ready');
        assert(result.summary.includes('Out of memory'));
      }
    },
    {
      name: 'test_state_extraction_unrecognized_role',
      fn: async () => {
        const line = JSON.stringify({
          role: 'telemetry_heartbeat',
          ping: true
        });
        const result = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(result, null, 'Unrecognized auxiliary log lines should return null');
      }
    }
  ]
};
