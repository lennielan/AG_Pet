/**
 * mock-transcript.js
 * Generates realistic Antigravity JSONL transcript events for testing
 * watcher, parser, and state machine extraction.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

class MockTranscriptGenerator {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.tmpdir(), `ag-pet-test-${crypto.randomUUID().slice(0, 8)}`);
    this.sessionUuid = options.sessionUuid || crypto.randomUUID();
    this.brainDir = path.join(this.baseDir, '.gemini', 'antigravity', 'brain', this.sessionUuid);
    this.filePath = path.join(this.brainDir, 'transcript.jsonl');
    this.active = false;
  }

  /**
   * Initializes the directory tree and creates the transcript file.
   */
  initSession() {
    fs.mkdirSync(this.brainDir, { recursive: true });
    fs.writeFileSync(this.filePath, '', { encoding: 'utf8' });
    this.active = true;
    return this.filePath;
  }

  /**
   * Appends an arbitrary raw line or object.
   */
  append(data) {
    if (!this.active) this.initSession();
    const line = typeof data === 'string' ? data : JSON.stringify(data);
    fs.appendFileSync(this.filePath, line.endsWith('\n') ? line : line + '\n', { encoding: 'utf8' });
  }

  /**
   * Simulates user input turn.
   */
  appendUserInput(content = 'Build a responsive website') {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'user',
      content
    });
  }

  /**
   * Simulates model extended thinking event.
   */
  appendThinking(thought = 'Analyzing project requirements and dependencies...') {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'model',
      thinking: { text: thought },
      summary: 'Thinking...'
    });
  }

  /**
   * Simulates agent launching a tool (state -> running).
   */
  appendToolCall(name = 'run_command', args = { CommandLine: 'npm test' }, toolId = `call_${Date.now()}`) {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'model',
      tool_calls: [
        {
          id: toolId,
          function: {
            name,
            arguments: typeof args === 'string' ? args : JSON.stringify(args)
          }
        }
      ],
      summary: `Running tool: ${name}`
    });
    return toolId;
  }

  /**
   * Simulates tool execution result.
   */
  appendToolResult(name = 'run_command', result = 'Tests passed', isError = false, toolId = `call_${Date.now()}`) {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'tool',
      name,
      tool_call_id: toolId,
      content: result,
      is_error: isError,
      summary: isError ? `Tool failed: ${name}` : `Completed ${name}`
    });
  }

  /**
   * Simulates agent asking the user for confirmation or input (state -> needs_input).
   */
  appendPromptUser(question = 'Do you want to proceed with deployment?') {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'model',
      prompt_user: true,
      question,
      summary: 'Awaiting user response'
    });
  }

  /**
   * Simulates turn completion (state -> ready).
   */
  appendTurnComplete(message = 'Task completed successfully.') {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'model',
      turn_complete: true,
      content: message,
      summary: 'Task complete'
    });
  }

  /**
   * Simulates execution error / failure (state -> blocked).
   */
  appendBlockedError(errorMessage = 'Fatal compilation failure', errorCode = 'ERR_BUILD_FAILED') {
    this.append({
      timestamp: new Date().toISOString(),
      role: 'system',
      error: {
        code: errorCode,
        message: errorMessage
      },
      blocked: true,
      summary: `Blocked: ${errorMessage}`
    });
  }

  /**
   * Simulates corrupted/partial bytes written during crash or race condition.
   */
  appendCorruptedBytes(garbage = '{"timestamp": "2026-10-13T12:00:00Z", "role": "mode') {
    this.append(garbage);
  }

  /**
   * Simulates brain rotation / new session creation.
   */
  rotateSession(newSessionUuid = crypto.randomUUID()) {
    const oldPath = this.filePath;
    this.sessionUuid = newSessionUuid;
    this.brainDir = path.join(this.baseDir, '.gemini', 'antigravity', 'brain', this.sessionUuid);
    this.filePath = path.join(this.brainDir, 'transcript.jsonl');
    this.initSession();
    return { oldPath, newPath: this.filePath };
  }

  /**
   * Cleans up scratch directory.
   */
  cleanup() {
    try {
      if (fs.existsSync(this.baseDir)) {
        fs.rmSync(this.baseDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup error in temp
    }
  }
}

module.exports = MockTranscriptGenerator;
