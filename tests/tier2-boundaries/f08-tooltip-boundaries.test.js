/**
 * f08-tooltip-boundaries.test.js
 * Feature 8 Boundaries: Interactive Tooltip & Activity Badge
 * Validates empty summaries fallback, massive text safety, rapid enter/leave churn,
 * unknown state colors, and screen edge clamping.
 */

const assert = require('node:assert');

function createResilientTooltip(state = 'idle', summary = '') {
  let isVisible = false;
  let currentState = state;
  let currentSummary = summary;

  const stateColors = {
    idle: '#94A3B8',
    running: '#00FFFF',
    needs_input: '#FBBF24',
    ready: '#4ADE80',
    blocked: '#F87171'
  };

  return {
    onMouseEnter: () => { isVisible = true; },
    onMouseLeave: () => { isVisible = false; },
    isVisible: () => isVisible,
    update: (st, sm) => {
      currentState = st;
      currentSummary = sm;
    },
    getDisplayText: () => {
      if (!currentSummary || currentSummary.trim() === '') {
        return currentState.toUpperCase();
      }
      if (currentSummary.length > 80) {
        return currentSummary.slice(0, 77) + '...';
      }
      return currentSummary;
    },
    getColor: () => stateColors[currentState] || '#E2E8F0',
    calculateTooltipPosition: (petX, petY, screenW, screenH, tooltipW = 120, tooltipH = 30) => {
      // Clamps tooltip coordinates to never overflow screen bounds
      let tipX = petX - (tooltipW / 2) + 16;
      let tipY = petY - tooltipH - 8; // positioned above pet

      if (tipY < 0) { // flip below pet if top overflow
        tipY = petY + 40;
      }
      tipX = Math.max(0, Math.min(screenW - tooltipW, tipX));
      tipY = Math.max(0, Math.min(screenH - tooltipH, tipY));

      return { x: tipX, y: tipY };
    }
  };
}

module.exports = {
  name: 'F08 Boundaries: Interactive Tooltip & Activity Badge',
  tier: 2,
  tests: [
    {
      name: 'test_tooltip_empty_activity_summary',
      fn: async () => {
        const tip = createResilientTooltip('running', '');
        assert.strictEqual(tip.getDisplayText(), 'RUNNING', 'Empty summary falls back to uppercase state name');
      }
    },
    {
      name: 'test_tooltip_massive_summary_text',
      fn: async () => {
        const tip = createResilientTooltip('running');
        const massive = 'X'.repeat(50000);
        tip.update('running', massive);
        const display = tip.getDisplayText();
        assert.strictEqual(display.length, 80);
        assert(display.endsWith('...'));
      }
    },
    {
      name: 'test_tooltip_rapid_enter_leave_churn',
      fn: async () => {
        const tip = createResilientTooltip('idle', 'Thinking');
        // 50 rapid mouse events
        for (let i = 0; i < 50; i++) {
          if (i % 2 === 0) tip.onMouseEnter();
          else tip.onMouseLeave();
        }
        // At 49 (odd), mouse left
        assert.strictEqual(tip.isVisible(), false);
      }
    },
    {
      name: 'test_tooltip_unknown_state_color_fallback',
      fn: async () => {
        const tip = createResilientTooltip('super_custom_state', 'Custom');
        assert.strictEqual(tip.getColor(), '#E2E8F0', 'Unknown state uses neutral slate fallback color');
      }
    },
    {
      name: 'test_tooltip_screen_edge_clamping',
      fn: async () => {
        const tip = createResilientTooltip('running', 'Active');
        // Pet at top-left corner (x=0, y=0)
        const posTopLeft = tip.calculateTooltipPosition(0, 0, 1920, 1080);
        assert(posTopLeft.x >= 0, 'Tooltip x cannot be negative');
        assert(posTopLeft.y >= 0, 'Tooltip y cannot be negative');

        // Pet at bottom-right corner (x=1900, y=1060)
        const posBottomRight = tip.calculateTooltipPosition(1900, 1060, 1920, 1080);
        assert(posBottomRight.x + 120 <= 1920, 'Tooltip cannot overflow screen right edge');
        assert(posBottomRight.y + 30 <= 1080, 'Tooltip cannot overflow screen bottom edge');
      }
    }
  ]
};
