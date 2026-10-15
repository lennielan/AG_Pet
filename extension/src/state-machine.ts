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

  // 5. Tool result / function response (agent completed tool execution and switches to thinking)
  const hasFunctionResponse = Array.isArray(obj.parts) && obj.parts.some((p: any) => p && (p.functionResponse || p.tool_result));
  const isToolResult =
    obj.type === 'TOOL_RESULT' ||
    obj.type === 'FUNCTION_RESPONSE' ||
    obj.role === 'tool' ||
    Boolean(obj.tool_result) ||
    Boolean(obj.functionResponse) ||
    hasFunctionResponse;

  if (isToolResult) {
    return {
      state: 'thinking',
      summary: 'Думаю...',
      timestamp,
      metadata: {
        thinking: true,
        toolResult: true,
        role: obj.role,
        type: obj.type,
      },
    };
  }

  // 6. Thinking / reasoning (Strictly real thought/thinking content)
  const hasThoughtPart = Array.isArray(obj.parts) && obj.parts.some((p: any) => p && p.thought);
  const isExplicitThinking =
    Boolean(obj.thinking) ||
    Boolean(obj.thought) ||
    obj.type === 'THOUGHT' ||
    obj.type === 'THINKING' ||
    hasThoughtPart;

  if (isExplicitThinking) {
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

  // 7. User input / Request start (running state)
  if (obj.type === 'USER_INPUT' || obj.role === 'user') {
    return {
      state: 'running',
      summary: obj.summary || 'Processing request...',
      timestamp,
      metadata: {
        role: obj.role || 'user',
        type: obj.type || 'USER_INPUT',
      },
    };
  }

  // 8. Model in-progress response streaming / tool execution
  if (
    (obj.role === 'model' && (obj.content || obj.parts)) ||
    (obj.type === 'GENERIC' && obj.status === 'DONE') ||
    (obj.type === 'PLANNER_RESPONSE' && !obj.turn_complete)
  ) {
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

export interface SessionContext {
  state: AgentState;
  summary: string;
  lastUpdated: number;
  metadata?: StateMetadata;
  lastToolCallTime?: number;
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
  private workingToThinkingTimer: NodeJS.Timeout | null = null;
  private hasCelebratedTurn: boolean = false;
  private sessions: Map<string, SessionContext> = new Map();

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
   * Parses and processes a transcript line with multi-session awareness.
   * If a state update is extracted, transitions the state machine according
   * to global priority resolution across all active sessions.
   */
  public processLine(line: string | null | undefined, sessionId: string = 'default'): StatePayload | null {
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

    const now = Date.now();
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        state: 'idle',
        summary: 'AG Pet ready',
        lastUpdated: now,
      };
      this.sessions.set(sessionId, session);
    }

    // Track active tool call timestamp for /btw and sub-turn quick response protection
    if (payload.state === 'running' && payload.metadata?.toolName) {
      session.lastToolCallTime = now;
    }

    // Update this session's context
    session.state = payload.state;
    session.summary = payload.summary;
    session.lastUpdated = now;
    session.metadata = payload.metadata;

    // Single-session default mode (for backward compatibility and synchronous unit tests)
    if (sessionId === 'default' || (this.sessions.size <= 1 && this.sessions.has('default'))) {
      if (this.readyDebounceTimer) {
        clearTimeout(this.readyDebounceTimer);
        this.readyDebounceTimer = null;
      }

      this.transitionTo(payload.state, payload.summary, payload.metadata);
      return this.currentPayload;
    }

    // Multi-session resolution mode:
    // Find all active sessions modified within the last 25 seconds
    const activeSessions: Array<{ id: string; session: SessionContext }> = [];
    for (const [id, sess] of this.sessions.entries()) {
      const isBusy = sess.state === 'running' || sess.state === 'thinking' || sess.state === 'needs_input' || sess.state === 'blocked';
      if (isBusy && (now - sess.lastUpdated < 25000)) {
        activeSessions.push({ id, session: sess });
      }
    }

    // Global Priority Resolution:
    // 1. Blocked
    // 2. Needs input
    // 3. Running (any session running keeps pet in running)
    // 4. Thinking
    // 5. Ready (only when no session is running/thinking) -> else idle
    let targetState: AgentState = 'idle';
    let targetSummary = payload.summary;
    let targetMetadata = payload.metadata;

    const blockedSession = activeSessions.find(s => s.session.state === 'blocked');
    const inputSession = activeSessions.find(s => s.session.state === 'needs_input');
    const runningSession = activeSessions.find(s => s.session.state === 'running');
    const thinkingSession = activeSessions.find(s => s.session.state === 'thinking');

    if (blockedSession) {
      targetState = 'blocked';
      targetSummary = blockedSession.session.summary;
      targetMetadata = blockedSession.session.metadata;
    } else if (inputSession) {
      targetState = 'needs_input';
      targetSummary = inputSession.session.summary;
      targetMetadata = inputSession.session.metadata;
    } else if (runningSession) {
      targetState = 'running';
      const recentRunning = activeSessions
        .filter(s => s.session.state === 'running')
        .sort((a, b) => b.session.lastUpdated - a.session.lastUpdated)[0];
      targetSummary = recentRunning ? recentRunning.session.summary : runningSession.session.summary;
      targetMetadata = recentRunning ? recentRunning.session.metadata : runningSession.session.metadata;
    } else if (thinkingSession) {
      targetState = 'thinking';
      targetSummary = thinkingSession.session.summary;
      targetMetadata = thinkingSession.session.metadata;
    } else {
      if (payload.state === 'ready') {
        targetState = 'ready';
        targetSummary = payload.summary;
        targetMetadata = payload.metadata;
      } else {
        targetState = 'idle';
        targetSummary = 'AG Pet ready';
      }
    }

    let finalSummary = targetSummary;
    if (activeSessions.length > 1 && sessionId !== 'default') {
      finalSummary = `[${activeSessions.length} чата] ${targetSummary}`;
    }

    // Protection against premature ready during rapid sub-turns / /btw:
    // If a turn_complete arrives within 1.5s of an active tool call, debounce ready
    if (targetState === 'ready' && session.lastToolCallTime && (now - session.lastToolCallTime < 1500)) {
      if (this.workingToThinkingTimer) {
        clearTimeout(this.workingToThinkingTimer);
        this.workingToThinkingTimer = null;
      }
      const remainingDelay = 1500 - (now - session.lastToolCallTime);
      if (this.readyDebounceTimer) {
        clearTimeout(this.readyDebounceTimer);
      }
      this.readyDebounceTimer = setTimeout(() => {
        this.readyDebounceTimer = null;
        if (this.currentState === 'running' || this.currentState === 'thinking') {
          this.transitionTo('ready', finalSummary, targetMetadata);
        }
      }, remainingDelay);
      if (typeof this.readyDebounceTimer.unref === 'function') {
        this.readyDebounceTimer.unref();
      }
      return this.currentPayload;
    }

    if (this.readyDebounceTimer) {
      clearTimeout(this.readyDebounceTimer);
      this.readyDebounceTimer = null;
    }

    this.transitionTo(targetState, finalSummary, targetMetadata);
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

    if (this.workingToThinkingTimer) {
      clearTimeout(this.workingToThinkingTimer);
      this.workingToThinkingTimer = null;
    }

    if (nextState === 'running') {
      this.hasCelebratedTurn = false;
      if (this.readyDebounceTimer) {
        clearTimeout(this.readyDebounceTimer);
        this.readyDebounceTimer = null;
      }

      // Schedule transition from Working (1.2s) / tool execution (1.8s) to Thinking
      const isUserInput =
        metadata?.type === 'USER_INPUT' ||
        metadata?.role === 'user' ||
        summary?.includes('Processing request') ||
        summary?.includes('В работе...');
      const delay = isUserInput ? 1200 : 1800;

      this.workingToThinkingTimer = setTimeout(() => {
        this.workingToThinkingTimer = null;
        if (this.currentState === 'running') {
          for (const sess of this.sessions.values()) {
            if (sess.state === 'running') {
              sess.state = 'thinking';
              sess.summary = 'Думаю...';
              sess.lastUpdated = Date.now();
            }
          }
          this.transitionTo('thinking', 'Думаю...', { autoThinking: true, thinking: true });
        }
      }, delay);
      if (typeof this.workingToThinkingTimer?.unref === 'function') {
        this.workingToThinkingTimer.unref();
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
    if (this.workingToThinkingTimer) {
      clearTimeout(this.workingToThinkingTimer);
      this.workingToThinkingTimer = null;
    }
    this.hasCelebratedTurn = false;
    this.sessions.clear();
    this.currentState = initialState;
    this.currentPayload = {
      state: initialState,
      summary: 'AG Pet reset',
      timestamp: Date.now(),
    };
    this.history = [{ ...this.currentPayload }];
    this.emit('reset', this.currentPayload);
  }

  public getSessions(): Map<string, SessionContext> {
    return new Map(this.sessions);
  }
}
