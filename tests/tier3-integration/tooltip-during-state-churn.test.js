/**
 * tooltip-during-state-churn.test.js
 * Tier 3 Pairwise: F08 (Activity Tooltip) × F13 (State Extraction Churn)
 * Validates hover tooltip updates during rapid agent tool executions.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Tooltip during State Churn',
  tier: 3,
  tests: [
    {
      name: 'test_tooltip_responsiveness_under_state_churn',
      fn: async () => {
        let isHovered = true;
        let activeSummary = '';
        let activeColor = '';

        const updateTooltip = (payload) => {
          if (!isHovered) return;
          activeSummary = payload.summary;
          activeColor = payload.state === 'running' ? '#00FFFF' : (payload.state === 'ready' ? '#4ADE80' : '#F87171');
        };

        const rawEvents = [
          { role: 'model', tool_calls: [{ function: { name: 'git_status' } }] },
          { role: 'model', tool_calls: [{ function: { name: 'edit_file' } }] },
          { role: 'model', tool_calls: [{ function: { name: 'run_tests' } }] },
          { role: 'model', turn_complete: true, content: 'All done' }
        ];

        for (const ev of rawEvents) {
          const parsed = TestHarness.parseTranscriptLine(JSON.stringify(ev));
          updateTooltip(parsed);
        }

        assert(activeSummary.includes('completed') || activeSummary === 'All done', 'Summary should reflect turn completion');
        assert.strictEqual(activeColor, '#4ADE80', 'Final color should be green ready indicator');
      }
    }
  ]
};
