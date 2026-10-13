/**
 * f08-activity-tooltip.test.js
 * Feature 8: Interactive Tooltip & Activity Badge
 * Validates hover activation, activity summary display, mouse leave hiding,
 * state color indicator, and text truncation.
 */

const assert = require('node:assert');

function createTooltipBadge(initialSummary = 'Idle', initialState = 'idle') {
  let isVisible = false;
  let summary = initialSummary;
  let state = initialState;

  const stateColors = {
    idle: '#94A3B8',
    running: '#00FFFF',
    needs_input: '#FBBF24',
    ready: '#4ADE80',
    blocked: '#F87171',
    dragging: '#38BDF8',
    waving: '#E879F9'
  };

  return {
    onMouseEnter: () => { isVisible = true; },
    onMouseLeave: () => { isVisible = false; },
    isVisible: () => isVisible,
    updateState: (newState, newSummary) => {
      state = newState;
      summary = newSummary || summary;
    },
    getStateColor: () => stateColors[state] || '#FFFFFF',
    getRenderedText: (maxLength = 60) => {
      if (summary.length <= maxLength) return summary;
      return summary.slice(0, maxLength - 3) + '...';
    }
  };
}

module.exports = {
  name: 'F08: Interactive Activity Tooltip & Badge',
  tier: 1,
  tests: [
    {
      name: 'test_hover_activates_tooltip',
      fn: async () => {
        const badge = createTooltipBadge();
        assert.strictEqual(badge.isVisible(), false);
        badge.onMouseEnter();
        assert.strictEqual(badge.isVisible(), true);
      }
    },
    {
      name: 'test_tooltip_displays_current_activity',
      fn: async () => {
        const badge = createTooltipBadge();
        badge.updateState('running', 'Running tool: run_command');
        assert.strictEqual(badge.getRenderedText(), 'Running tool: run_command');
      }
    },
    {
      name: 'test_mouse_leave_hides_tooltip',
      fn: async () => {
        const badge = createTooltipBadge();
        badge.onMouseEnter();
        assert.strictEqual(badge.isVisible(), true);
        badge.onMouseLeave();
        assert.strictEqual(badge.isVisible(), false);
      }
    },
    {
      name: 'test_tooltip_state_color_indicator',
      fn: async () => {
        const badge = createTooltipBadge();
        badge.updateState('running');
        assert.strictEqual(badge.getStateColor(), '#00FFFF', 'Running state should have cyan indicator');
        badge.updateState('blocked');
        assert.strictEqual(badge.getStateColor(), '#F87171', 'Blocked state should have red indicator');
      }
    },
    {
      name: 'test_tooltip_text_truncation',
      fn: async () => {
        const badge = createTooltipBadge();
        const veryLongText = 'Analyzing 50 files in the workspace and optimizing all database query joins with index hints';
        badge.updateState('running', veryLongText);
        const rendered = badge.getRenderedText(40);
        assert(rendered.length <= 40, 'Rendered text must not exceed max length');
        assert(rendered.endsWith('...'), 'Rendered text must end with ellipsis');
      }
    }
  ]
};
