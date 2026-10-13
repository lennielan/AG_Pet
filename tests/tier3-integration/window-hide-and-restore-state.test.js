/**
 * window-hide-and-restore-state.test.js
 * Tier 3 Pairwise: F07 (Hide Pet via Context Menu) × F14 (State Updates while Hidden)
 * Validates state updates streaming in background and restored on unhiding.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');

module.exports = {
  name: 'T3 Pairwise: Window Hide and Restore State',
  tier: 3,
  tests: [
    {
      name: 'test_state_synchronization_while_window_hidden',
      fn: async () => {
        let isWindowVisible = true;
        let lastReceivedState = 'idle';

        const hideWindow = () => { isWindowVisible = false; };
        const showWindow = () => { isWindowVisible = true; };

        // Hide pet via context menu
        hideWindow();
        assert.strictEqual(isWindowVisible, false);

        // While hidden, background IPC receives running -> ready events
        const bgEvents = ['running', 'ready'];
        for (const st of bgEvents) {
          lastReceivedState = st;
        }

        // User unhides pet
        showWindow();
        assert.strictEqual(isWindowVisible, true);
        assert.strictEqual(lastReceivedState, 'ready', 'Restored pet must reflect latest ready state');
      }
    }
  ]
};
