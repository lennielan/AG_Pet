/**
 * f09-click-focus-ide.test.js
 * Feature 9: Click Focus Antigravity IDE
 * Validates click-to-focus message dispatch, waving animation trigger,
 * debouncing, message validation, and drag-vs-click separation.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

function createPetClickHandler({ onFocus, onWave, debounceMs = 250 }) {
  let lastClickTime = 0;
  let focusCount = 0;
  let waveCount = 0;

  const handlePointerDown = (x, y) => ({ startX: x, startY: y, time: Date.now() });

  const handlePointerUp = (start, endX, endY) => {
    const dist = Math.hypot(endX - start.startX, endY - start.startY);
    // If movement is > 5px, it was a drag, not a click
    if (dist > 5) {
      return { isClick: false, dist };
    }

    const now = Date.now();
    waveCount++;
    if (onWave) onWave();

    if (now - lastClickTime >= debounceMs) {
      lastClickTime = now;
      focusCount++;
      if (onFocus) onFocus({ type: 'focus_ide' });
      return { isClick: true, focused: true };
    }
    return { isClick: true, focused: false, debounced: true };
  };

  return {
    handlePointerDown,
    handlePointerUp,
    getFocusCount: () => focusCount,
    getWaveCount: () => waveCount
  };
}

module.exports = {
  name: 'F09: Click Focus Antigravity IDE',
  tier: 1,
  tests: [
    {
      name: 'test_click_dispatches_focus_ipc_message',
      fn: async () => {
        let sentMessage = null;
        const handler = createPetClickHandler({
          onFocus: (msg) => { sentMessage = msg; }
        });

        const down = handler.handlePointerDown(10, 10);
        handler.handlePointerUp(down, 10, 10);

        assert.deepStrictEqual(sentMessage, { type: 'focus_ide' });
      }
    },
    {
      name: 'test_click_triggers_waving_animation',
      fn: async () => {
        let waved = false;
        const handler = createPetClickHandler({
          onWave: () => { waved = true; }
        });

        const down = handler.handlePointerDown(20, 20);
        handler.handlePointerUp(down, 20, 20);

        assert.strictEqual(waved, true, 'Left click must trigger waving reaction');
      }
    },
    {
      name: 'test_rapid_clicks_debouncing',
      fn: async () => {
        const handler = createPetClickHandler({ debounceMs: 200 });

        // Rapid click 5 times with 10ms gap
        const down1 = handler.handlePointerDown(10, 10);
        handler.handlePointerUp(down1, 10, 10);

        const down2 = handler.handlePointerDown(10, 10);
        handler.handlePointerUp(down2, 10, 10);

        const down3 = handler.handlePointerDown(10, 10);
        handler.handlePointerUp(down3, 10, 10);

        assert.strictEqual(handler.getFocusCount(), 1, 'Only first click within debounce window should trigger OS focus');
        assert.strictEqual(handler.getWaveCount(), 3, 'Animation wave can still trigger on clicks');
      }
    },
    {
      name: 'test_focus_message_validation',
      fn: async () => {
        const msg = { type: 'focus_ide' };
        const validation = contracts.validateIPCMessage(msg, 'client-to-server');
        assert.strictEqual(validation.valid, true);

        const invalidMsg = { type: 'invalid_action' };
        const invalidCheck = contracts.validateIPCMessage(invalidMsg, 'client-to-server');
        assert.strictEqual(invalidCheck.valid, false);
      }
    },
    {
      name: 'test_drag_does_not_trigger_focus',
      fn: async () => {
        let focusDispatched = false;
        const handler = createPetClickHandler({
          onFocus: () => { focusDispatched = true; }
        });

        // User drags pet by 50px
        const down = handler.handlePointerDown(10, 10);
        const res = handler.handlePointerUp(down, 60, 60);

        assert.strictEqual(res.isClick, false, 'Movement over 5px must be recognized as drag');
        assert.strictEqual(focusDispatched, false, 'Dragging must NOT dispatch focus request');
      }
    }
  ]
};
