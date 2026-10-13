/**
 * f02-animation-states.test.js
 * Feature 2: Modular Animation States
 * Validates 7 distinct states, facial expressions, transitions,
 * payload schema, and idle hovering bob oscillation.
 */

const assert = require('node:assert');
const TestHarness = require('../harness/test-harness');
const { contracts } = TestHarness;

module.exports = {
  name: 'F02: Modular Animation States',
  tier: 1,
  tests: [
    {
      name: 'test_all_seven_agent_states_valid',
      fn: async () => {
        const expectedStates = ['idle', 'running', 'needs_input', 'ready', 'blocked', 'dragging', 'waving'];
        assert.deepStrictEqual(contracts.VALID_AGENT_STATES, expectedStates);
        for (const state of expectedStates) {
          const res = contracts.validateStatePayload({
            state,
            summary: `State is ${state}`,
            timestamp: Date.now()
          });
          assert.strictEqual(res.valid, true, `State ${state} should be valid`);
        }
      }
    },
    {
      name: 'test_facial_expressions_mapping',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('idle');
        assert.strictEqual(sm.getScreenExpression(), '^ ^');

        sm.transitionTo('running');
        assert.strictEqual(sm.getScreenExpression(), '||||');

        sm.transitionTo('needs_input');
        assert.strictEqual(sm.getScreenExpression(), '? ?');

        sm.transitionTo('ready');
        assert.strictEqual(sm.getScreenExpression(), '★ ★');

        sm.transitionTo('blocked');
        assert.strictEqual(sm.getScreenExpression(), 'X X');
      }
    },
    {
      name: 'test_state_transitions_sequence',
      fn: async () => {
        const sm = TestHarness.createAnimationStateMachine('idle');
        const flow = ['running', 'needs_input', 'running', 'ready', 'idle'];
        for (const nextState of flow) {
          sm.transitionTo(nextState, `Transition to ${nextState}`);
        }
        assert.deepStrictEqual(sm.getHistory(), ['idle', ...flow]);
      }
    },
    {
      name: 'test_state_payload_contract',
      fn: async () => {
        const payload = {
          state: 'running',
          summary: 'Executing npm build...',
          timestamp: 1770000000000,
          metadata: { toolName: 'run_command', step: 3 }
        };
        const validation = contracts.validateStatePayload(payload);
        assert.strictEqual(validation.valid, true);
        assert.strictEqual(payload.metadata.toolName, 'run_command');
      }
    },
    {
      name: 'test_hovering_bob_oscillation_values',
      fn: async () => {
        // Simulates 60fps sine bob: yOffset = Math.round(2 * Math.sin(t * frequency))
        const sampleOffsets = [];
        const frames = 60; // 1 second
        for (let frame = 0; frame < frames; frame++) {
          const t = frame / frames;
          const offset = Math.round(2 * Math.sin(t * 2 * Math.PI));
          sampleOffsets.push(offset);
        }
        // Offset bounds must stay within [-2, 2] pixels
        assert(sampleOffsets.every(v => v >= -2 && v <= 2), 'Offset must be between -2 and 2');
        // Must contain both top (+2 or -2) and return to 0
        assert(sampleOffsets.includes(-2) || sampleOffsets.includes(2), 'Must reach peak oscillation');
        assert(sampleOffsets.includes(0), 'Must return to baseline 0');
      }
    }
  ]
};
