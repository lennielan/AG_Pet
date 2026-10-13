/**
 * f13-state-machine-extraction.test.js
 * Feature 13: Agent State Machine Extraction
 * Validates extraction of running (tool), needs_input (prompt), ready (complete),
 * blocked (error), and thinking states from raw JSONL lines.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'F13: Agent State Machine Extraction',
  tier: 1,
  tests: [
    {
      name: 'test_extract_running_state_from_tool_call',
      fn: async () => {
        const line = JSON.stringify({
          role: 'model',
          tool_calls: [{ function: { name: 'run_command', arguments: '{}' } }]
        });
        const extracted = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(extracted.state, 'running');
        assert.strictEqual(extracted.metadata.toolName, 'run_command');
        assert(extracted.summary.includes('run_command'));
      }
    },
    {
      name: 'test_extract_needs_input_from_prompt_user',
      fn: async () => {
        const line = JSON.stringify({
          role: 'model',
          prompt_user: true,
          question: 'Proceed with changes?'
        });
        const extracted = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(extracted.state, 'needs_input');
        assert(extracted.summary.toLowerCase().includes('awaiting user input'));
      }
    },
    {
      name: 'test_extract_ready_from_turn_complete',
      fn: async () => {
        const line = JSON.stringify({
          role: 'model',
          turn_complete: true,
          content: 'Finished all tasks'
        });
        const extracted = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(extracted.state, 'ready');
        assert(extracted.summary.includes('completed'));
      }
    },
    {
      name: 'test_extract_blocked_from_error',
      fn: async () => {
        const line = JSON.stringify({
          role: 'system',
          error: { code: 'EXEC_ERROR', message: 'Command failed with exit code 1' },
          blocked: true
        });
        const extracted = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(extracted.state, 'blocked');
        assert(extracted.summary.includes('Blocked'));
      }
    },
    {
      name: 'test_extract_thinking_state',
      fn: async () => {
        const line = JSON.stringify({
          role: 'model',
          thinking: { text: 'Considering algorithm choice...' }
        });
        const extracted = TestHarness.parseTranscriptLine(line);
        assert.strictEqual(extracted.state, 'running');
        assert.strictEqual(extracted.summary, 'Thinking...');
      }
    }
  ]
};
