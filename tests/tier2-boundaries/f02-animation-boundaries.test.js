/**
 * f02-animation-boundaries.test.js
 * Feature 2 Boundaries: Modular Animation States
 * Validates invalid states, rapid churning, empty summaries,
 * bad timestamps, and expression fallbacks.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

module.exports = {
  name: 'F02 Boundaries: Modular Animation States',
  tier: 2,
  tests: [
    {
      name: 'test_invalid_state_transition_rejection',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('idle');
        assert.throws(() => {
          sm.transitionTo('exploding');
        }, /Invalid state transition/);

        assert.throws(() => {
          sm.transitionTo(null);
        }, /Invalid state transition/);
      }
    },
    {
      name: 'test_rapid_oscillating_state_churn',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('idle');
        const states = contracts.VALID_AGENT_STATES;
        // Churn through 100 transitions
        for (let i = 0; i < 100; i++) {
          const nextState = states[i % states.length];
          sm.transitionTo(nextState, `Churn ${i}`);
        }
        assert.strictEqual(sm.getHistory().length, 101);
        assert.strictEqual(sm.getState(), states[99 % states.length]);
      }
    },
    {
      name: 'test_empty_summary_in_state_payload',
      fn: async () => {
        const payload = {
          state: 'running',
          summary: '',
          timestamp: Date.now()
        };
        const res = contracts.validateStatePayload(payload);
        assert.strictEqual(res.valid, false);
        assert(res.error.includes('Summary must be a non-empty string'));
      }
    },
    {
      name: 'test_missing_timestamp_in_payload',
      fn: async () => {
        const payload = {
          state: 'running',
          summary: 'Working...',
          timestamp: -100
        };
        const res = contracts.validateStatePayload(payload);
        assert.strictEqual(res.valid, false);
        assert(res.error.includes('Timestamp must be a positive number'));
      }
    },
    {
      name: 'test_unknown_expression_fallback',
      fn: async () => {
        const expr = contracts.SCREEN_EXPRESSIONS['non_existent_state'] || '^ ^';
        assert.strictEqual(expr, '^ ^', 'Fallback expression must default to friendly eyes');
      }
    }
  ]
};
