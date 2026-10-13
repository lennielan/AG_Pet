/**
 * workload-5-rapid-state-churn-tooltip.test.js
 * Tier 4 Workload 5: Rapid State Churn & Hover Activity Tooltip Responsiveness
 * Simulates high-velocity agent activity while user hovers badge.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'Workload 5: Rapid State Churn & Tooltip',
  tier: 4,
  tests: [
    {
      name: 'test_rapid_state_churn_and_hover_badge_tracking',
      fn: async () => {
        const harness = new TestHarness('Workload 5');
        const { server, port } = await harness.createBridgeServer();
        const client = await harness.createOverlayClient(port);

        const tools = [
          'read_file', 'grep_search', 'replace_file_content', 'run_command',
          'git_status', 'check_linter', 'format_code', 'unit_tests',
          'read_docs', 'search_symbols', 'inspect_type', 'generate_asset'
        ];

        let currentHoverSummary = '';
        let currentHoverState = '';

        client.on('message', (msg) => {
          if (msg.type === 'state_update') {
            currentHoverState = msg.payload.state;
            currentHoverSummary = msg.payload.summary;
          }
        });

        // Fire 12 tool steps in rapid succession (10ms interval)
        for (let i = 0; i < tools.length; i++) {
          const tool = tools[i];
          const payload = {
            state: 'running',
            summary: `Step ${i + 1}/${tools.length}: ${tool}`,
            timestamp: Date.now(),
            metadata: { toolName: tool, step: i + 1 }
          };
          server.broadcast({ type: 'state_update', payload });
          await new Promise(r => setTimeout(r, 15));
        }

        // Final completion event
        server.broadcast({
          type: 'state_update',
          payload: { state: 'ready', summary: 'All 12 pipeline steps succeeded', timestamp: Date.now() }
        });

        // Wait for final frame
        const finalMsg = await client.waitForMessage(m => m.payload?.state === 'ready');
        assert.strictEqual(finalMsg.payload.state, 'ready');
        assert.strictEqual(currentHoverState, 'ready');
        assert.strictEqual(currentHoverSummary, 'All 12 pipeline steps succeeded');

        await harness.cleanup();
      }
    }
  ]
};
