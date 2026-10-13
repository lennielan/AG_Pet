/**
 * extension/src/state-machine.ts
 * Real-time Agent State Machine and Transcript Line Parser.
 *
 * Extracts core agent states ('running', 'needs_input', 'ready', 'blocked')
 * and human-readable activity summaries from raw Antigravity JSONL session logs.
 */

import { EventEmitter } from 'node:events';
import { AgentState, StatePayload, StateMetadata } from '../../shared/types';
import { ALL_AGENT_STATES, SCREEN_EXPRESSIONS, validateStatePayload } from '../../shared/constants';

export type ParseResult =
  | StatePayload
  | { type: 'corrupted'; raw: string; error?: string }
  | null;

export interface StateMachineOptions {
  initialState?: AgentState;
  initialSummary?: string;
  maxHistorySize?: number;
}

/**
 * Pure parsing function extracting state from a single transcript line.
 * Implements strict precedence:
 *   1. Blocked / Error
 *   2. Prompt user / Question (needs_input)
 *   3. Turn complete (ready)
 *   4. Tool calls (running)
 *   5. Thinking (running)
 *   6. User input / Request start (running)
 *   7. Auxiliary / Unrecognized -> null
 */
export function parseTranscriptLine(line: string | null | undefined): ParseResult {
  if (!line || typeof line !== 'string') {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let obj: any;
  try {
    obj = JSON.parse(trimmed);
  } catch (err: any) {
    return {
      type: 'corrupted',
      raw: trimmed,
      error: err?.message || 'Malformed JSON',
    };
  }

  if (typeof obj !== 'object' || obj === null) {
    return null;
  }

  const timestamp = Date.now();

  // 1. Error / Blocked state (highest priority)
  if (obj.blocked || (obj.error && (obj.error.code || obj.error.message)) || obj.status === 'ERROR') {
    const errorMsg = obj.error?.message || obj.error?.code || (typeof obj.content === 'string' ? obj.content.slice(0, 50) : '') || 'execution error';
    const summary = obj.summary || `Blocked: ${errorMsg}`;
    return {
      state: 'blocked',
      summary,
      timestamp,
      metadata: {
        errorMessage: errorMsg,
        errorCode: obj.error?.code,
        blocked: true,
      },
    };
  }

  // 2. Needs input state (explicit prompts or ask_question tool call)
  const hasAskQuestion = obj.tool_calls && Array.isArray(obj.tool_calls) && obj.tool_calls.some((tc: any) =>
    tc.name === 'ask_question' || tc.function?.name === 'ask_question' || tc.tool === 'ask_question'
  );
  if (obj.prompt_user || obj.question || hasAskQuestion) {
    const questionText = typeof obj.question === 'string' ? obj.question : '';
    const summary = obj.summary || (questionText ? `Awaiting user input: ${questionText}` : 'Awaiting user input');
    return {
      state: 'needs_input',
      summary,
      timestamp,
      metadata: {
        question: questionText || undefined,
        promptUser: true,
      },
    };
  }

  // 3. Ready / Turn complete state
  if (obj.turn_complete || (obj.type === 'PLANNER_RESPONSE' && obj.content && (!obj.tool_calls || obj.tool_calls.length === 0))) {
    const summary = obj.summary || 'Task completed successfully';
    return {
      state: 'ready',
      summary,
      timestamp,
      metadata: {
        turnComplete: true,
        content: typeof obj.content === 'string' ? obj.content : undefined,
      },
    };
  }

  // 4. Tool call (running state)
  if (obj.tool_calls && Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
    const firstCall = obj.tool_calls[0];
    const toolName = firstCall?.function?.name || firstCall?.name || firstCall?.tool || 'tool';
    const summary = obj.summary || `Running tool: ${toolName}`;
    return {
      state: 'running',
      summary,
      timestamp,
      metadata: {
        toolName,
        step: typeof obj.step === 'number' ? obj.step : undefined,
      },
    };
  }

  // 5. User prompt message (running state)
  if (obj.type === 'USER_INPUT' || obj.role === 'user') {
    const summary = obj.summary || 'Processing request...';
    return {
      state: 'running',
      summary,
      timestamp,
      metadata: {
        role: 'user',
        type: obj.type,
      },
    };
  }

  // 6. Thinking / reasoning (running state)
  if (obj.thinking || (obj.type === 'PLANNER_RESPONSE' && !obj.turn_complete)) {
    const summary = typeof obj.thinking === 'object' && obj.thinking?.text
      ? 'Thinking...'
      : (typeof obj.summary === 'string' ? obj.summary : 'Thinking...');
    return {
      state: 'running',
      summary,
      timestamp,
      metadata: {
        thinking: true,
      },
    };
  }

  // 7. Model in-progress response streaming
  if (obj.role === 'model' && (obj.content || obj.parts)) {
    return {
      state: 'running',
      summary: obj.summary || 'Generating response...',
      timestamp,
      metadata: {
        role: 'model',
      },
    };
  }

  // Unrecognized line (e.g. telemetry, metadata)
  return null;
}

/**
 * Stateful Agent State Machine.
 * Tracks lifecycle transitions, keeps history, and emits transition events.
 */
export class AgentStateMachine extends EventEmitter {
  private currentState: AgentState;
  private currentPayload: StatePayload;
  private history: StatePayload[] = [];
  private readonly maxHistorySize: number;
  private readyAutoReturnTimer: NodeJS.Timeout | null = null;

  constructor(options: StateMachineOptions = {}) {
    super();
    this.currentState = options.initialState || 'idle';
    this.maxHistorySize = options.maxHistorySize || 100;
    this.currentPayload = {
      state: this.currentState,
      summary: options.initialSummary || 'AG Pet ready',
      timestamp: Date.now(),
    };
    this.history.push({ ...this.currentPayload });
  }

  /**
   * Parses and processes a transcript line.
   * If a state update is extracted, transitions the state machine.
   */
  public processLine(line: string | null | undefined): StatePayload | null {
    const result = parseTranscriptLine(line);
    if (!result) {
      return null;
    }

    if ('type' in result && result.type === 'corrupted') {
      this.emit('corrupted_line', result.raw, result.error);
      return null;
    }

    const payload = result as StatePayload;
    const validation = validateStatePayload(payload);
    if (!validation.valid) {
      return null;
    }

    this.transitionTo(payload.state, payload.summary, payload.metadata);
    return this.currentPayload;
  }

  /**
   * Explicit state transition.
   */
  public transitionTo(
    nextState: AgentState,
    summary: string,
    metadata?: StateMetadata
  ): StatePayload {
    if (!ALL_AGENT_STATES.includes(nextState)) {
      throw new Error(`Invalid state transition target: ${nextState}`);
    }

    if (this.readyAutoReturnTimer) {
      clearTimeout(this.readyAutoReturnTimer);
      this.readyAutoReturnTimer = null;
    }

    const prevPayload = this.currentPayload;
    this.currentState = nextState;
    this.currentPayload = {
      state: nextState,
      summary: summary || `Agent is ${nextState}`,
      timestamp: Date.now(),
      metadata,
    };

    this.history.push({ ...this.currentPayload });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Auto-return from ready celebration to idle after 3 seconds
    if (nextState === 'ready') {
      this.readyAutoReturnTimer = setTimeout(() => {
        if (this.currentState === 'ready') {
          this.transitionTo('idle', 'Idle');
        }
      }, 3000);
      if (typeof this.readyAutoReturnTimer.unref === 'function') {
        this.readyAutoReturnTimer.unref();
      }
    }

    this.emit('state_change', this.currentPayload, prevPayload);
    return this.currentPayload;
  }

  public getCurrentState(): AgentState {
    return this.currentState;
  }

  public getCurrentPayload(): Readonly<StatePayload> {
    return { ...this.currentPayload };
  }

  public getScreenExpression(): string {
    return SCREEN_EXPRESSIONS[this.currentState] || '^ ^';
  }

  public getHistory(): ReadonlyArray<StatePayload> {
    return [...this.history];
  }

  public reset(initialState: AgentState = 'idle'): void {
    if (this.readyAutoReturnTimer) {
      clearTimeout(this.readyAutoReturnTimer);
      this.readyAutoReturnTimer = null;
    }
    this.currentState = initialState;
    this.currentPayload = {
      state: initialState,
      summary: 'AG Pet reset',
      timestamp: Date.now(),
    };
    this.history = [{ ...this.currentPayload }];
    this.emit('reset', this.currentPayload);
  }
}
