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
  if (obj.turn_complete || (obj.type === 'PLANNER_RESPONSE' && (!obj.tool_calls || obj.tool_calls.length === 0) && (typeof obj.content === 'string' || obj.status === 'DONE'))) {
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
    const actionDesc = firstCall?.args?.toolAction || firstCall?.args?.toolSummary || firstCall?.toolAction || firstCall?.toolSummary;
    const summary = obj.summary || (actionDesc ? `Running: ${actionDesc}` : `Running tool: ${toolName}`);
    return {
      state: 'running',
      summary,
      timestamp,
      metadata: {
        toolName,
        step: typeof obj.step === 'number' ? obj.step : (typeof obj.step_index === 'number' ? obj.step_index : undefined),
      },
    };
  }

  // 5. Thinking / reasoning / user prompt (thinking state)
  const hasThoughtPart = Array.isArray(obj.parts) && obj.parts.some((p: any) => p && p.thought);
  const isThinking =
    Boolean(obj.thinking) ||
    Boolean(obj.thought) ||
    obj.type === 'THOUGHT' ||
    hasThoughtPart ||
    (obj.type === 'PLANNER_RESPONSE' && !obj.turn_complete && (!obj.tool_calls || obj.tool_calls.length === 0)) ||
    obj.type === 'USER_INPUT' ||
    obj.role === 'user';

  if (isThinking) {
    const summary = typeof obj.thinking === 'object' && obj.thinking?.text
      ? 'Thinking...'
      : (typeof obj.summary === 'string' ? obj.summary : 'Thinking...');
    return {
      state: 'thinking',
      summary,
      timestamp,
      metadata: {
        thinking: true,
        role: obj.role,
        type: obj.type,
      },
    };
  }

  // 6. Model in-progress response streaming / tool execution
  if ((obj.role === 'model' && (obj.content || obj.parts)) || (obj.type === 'GENERIC' && obj.status === 'DONE')) {
    return {
      state: 'running',
      summary: obj.summary || 'Executing task...',
      timestamp,
      metadata: {
        role: obj.role || 'model',
        type: obj.type,
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
  private readyDebounceTimer: NodeJS.Timeout | null = null;
  private thinkingTransitionTimer: NodeJS.Timeout | null = null;
  private hasCelebratedTurn: boolean = false;

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

    // Debounce ready if arriving while actively running or thinking to prevent hop-spam during multi-step tasks
    if (payload.state === 'ready' && (this.currentState === 'running' || this.currentState === 'thinking')) {
      if (this.readyDebounceTimer) {
        clearTimeout(this.readyDebounceTimer);
      }
      this.readyDebounceTimer = setTimeout(() => {
        this.readyDebounceTimer = null;
        if (this.currentState === 'running' || this.currentState === 'thinking') {
          this.transitionTo(payload.state, payload.summary, payload.metadata);
        }
      }, 3000);
      if (typeof this.readyDebounceTimer.unref === 'function') {
        this.readyDebounceTimer.unref();
      }
      return this.currentPayload;
    }

    if (this.readyDebounceTimer) {
      clearTimeout(this.readyDebounceTimer);
      this.readyDebounceTimer = null;
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

    if (this.thinkingTransitionTimer) {
      clearTimeout(this.thinkingTransitionTimer);
      this.thinkingTransitionTimer = null;
    }

    if (nextState === 'running') {
      this.hasCelebratedTurn = false;
      if (this.readyDebounceTimer) {
        clearTimeout(this.readyDebounceTimer);
        this.readyDebounceTimer = null;
      }

      // Automatically transition from running to thinking after 1.8s of no new tool calls
      this.thinkingTransitionTimer = setTimeout(() => {
        this.thinkingTransitionTimer = null;
        if (this.currentState === 'running') {
          this.transitionTo('thinking', 'Thinking...');
        }
      }, 1800);
      if (typeof this.thinkingTransitionTimer.unref === 'function') {
        this.thinkingTransitionTimer.unref();
      }
    }

    if (nextState === 'thinking') {
      this.hasCelebratedTurn = false;
    }

    if (nextState === 'ready') {
      if (this.hasCelebratedTurn) {
        return this.currentPayload;
      }
      this.hasCelebratedTurn = true;
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

    // Auto-return from ready celebration to idle after 1.8 seconds
    if (nextState === 'ready') {
      this.readyAutoReturnTimer = setTimeout(() => {
        if (this.currentState === 'ready') {
          this.transitionTo('idle', 'Idle');
        }
      }, 1800);
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
    if (this.readyDebounceTimer) {
      clearTimeout(this.readyDebounceTimer);
      this.readyDebounceTimer = null;
    }
    if (this.thinkingTransitionTimer) {
      clearTimeout(this.thinkingTransitionTimer);
      this.thinkingTransitionTimer = null;
    }
    this.hasCelebratedTurn = false;
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
