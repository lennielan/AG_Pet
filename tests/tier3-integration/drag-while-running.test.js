/**
 * drag-while-running.test.js
 * Tier 3 Pairwise: F06 (Drag & Drop) × F02/F13 (Running State)
 * Validates dragging while agent transcript transitions to running state.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Drag while Running',
  tier: 3,
  tests: [
    {
      name: 'test_drag_during_running_state_transition',
      fn: async () => {
        const dragModel = TestHarness.createDragPersistModel({ x: 100, y: 100, scale: 1.0, isMuted: false });
        const sm = TestHarness.createAnimationStateMachine('idle');

        // User starts dragging
        dragModel.startDrag(50, 50);
        dragModel.dragMove(70, 80);

        // While mouse is held, agent starts running tool
        sm.transitionTo('running', 'Running tool: git status');

        // Drag continues
        dragModel.dragMove(90, 110);
        const finalCfg = dragModel.endDrag();

        assert.strictEqual(finalCfg.x, 140, 'Final x must reflect total drag delta');
        assert.strictEqual(finalCfg.y, 160, 'Final y must reflect total drag delta');
        assert.strictEqual(sm.getState(), 'running', 'State must be running');
        assert.strictEqual(sm.getScreenExpression(), '||||');
      }
    }
  ]
};
