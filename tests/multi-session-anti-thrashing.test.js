/**
 * tests/multi-session-anti-thrashing.test.js
 * Verification of Multi-Session Concurrency, /btw Support,
 * Non-Destructive Offset Persistence, and Anti-Flicker Gate.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

async function run() {
  console.log('Testing Multi-Session & Anti-Thrashing Suite...');

  const {
    findActiveTranscriptFiles,
    TranscriptWatcher,
  } = require('../extension/dist/extension/src/transcript-watcher');
  const { AgentStateMachine } = require('../extension/dist/extension/src/state-machine');
  const { PetEngine } = require('../dist/sprite-engine/index');

  // 1. Test findActiveTranscriptFiles across multiple concurrent sessions
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-pet-multi-session-'));
  const sess1 = path.join(tmpDir, 'session-chat-1');
  const sess2 = path.join(tmpDir, 'session-chat-2');
  fs.mkdirSync(sess1, { recursive: true });
  fs.mkdirSync(sess2, { recursive: true });

  const file1 = path.join(sess1, 'transcript.jsonl');
  const file2 = path.join(sess2, 'transcript.jsonl');

  fs.writeFileSync(file1, '{"role":"model","tool_calls":[{"name":"view_file"}]}\n', 'utf8');
  fs.writeFileSync(file2, '{"role":"model","tool_calls":[{"name":"run_command"}]}\n', 'utf8');

  const activeFiles = findActiveTranscriptFiles(tmpDir, 60000);
  assert.strictEqual(activeFiles.length, 2, 'Must discover both active chat transcripts');
  assert(activeFiles.includes(file1) && activeFiles.includes(file2));
  console.log('✔ findActiveTranscriptFiles discovers multiple concurrent chat logs');

  // 2. Test TranscriptWatcher per-file offset persistence (NO RESET TO 0)
  const watcher = new TranscriptWatcher({
    brainRootDir: tmpDir,
    startFromBeginning: true,
    autoStart: false,
  });

  const lines1 = watcher.poll();
  assert.strictEqual(lines1.length, 2, 'Initial poll reads 1 line from each active session');
  const offset1_file1 = watcher.getOffset(file1);
  const offset1_file2 = watcher.getOffset(file2);
  assert(offset1_file1 > 0);
  assert(offset1_file2 > 0);

  // Append only to file2 (/btw or second chat activity)
  fs.appendFileSync(file2, '{"role":"model","turn_complete":true}\n', 'utf8');

  const lines2 = watcher.poll();
  assert.strictEqual(lines2.length, 1, 'Second poll only reads new line from file2');
  assert.strictEqual(watcher.getOffset(file1), offset1_file1, 'File 1 offset must remain unchanged (NO reset to 0!)');
  assert(watcher.getOffset(file2) > offset1_file2, 'File 2 offset advanced');
  console.log('✔ TranscriptWatcher retains per-file offsets without resetting on switch');

  // 3. Test AgentStateMachine multi-session priority aggregation
  const sm = new AgentStateMachine({ initialState: 'idle' });

  // Chat 1 starts a heavy tool
  sm.processLine('{"role":"model","tool_calls":[{"name":"replace_file_content"}]}', 'chat-1');
  assert.strictEqual(sm.getCurrentState(), 'running');

  // Chat 2 (/btw) asks a quick question and finishes
  sm.processLine('{"role":"user","content":"what time is it?"}', 'chat-2');
  assert.strictEqual(sm.getCurrentState(), 'running', 'Chat 1 running must take precedence over chat 2 thinking');
  assert(sm.getCurrentPayload().summary.includes('[2 чата]'), 'Summary must reflect 2 concurrent active chats');

  sm.processLine('{"role":"model","turn_complete":true,"content":"It is 13:00"}', 'chat-2');
  assert.strictEqual(sm.getCurrentState(), 'running', 'Chat 2 completion must NOT stop Gravi while Chat 1 is running');

  // Chat 1 encounters needs_input (prompting user)
  sm.processLine('{"role":"model","prompt_user":true,"question":"Delete database?"}', 'chat-1');
  assert.strictEqual(sm.getCurrentState(), 'needs_input', 'needs_input takes precedence over running/idle');

  // Chat 2 errors out
  sm.processLine('{"role":"system","status":"ERROR","content":"Connection reset"}', 'chat-2');
  assert.strictEqual(sm.getCurrentState(), 'blocked', 'blocked error state has absolute priority over needs_input and running');

  // Resolve error and finish Chat 1
  sm.reset('idle');
  sm.processLine('{"role":"model","tool_calls":[{"name":"run_command"}]}', 'chat-1');
  assert.strictEqual(sm.getCurrentState(), 'running');

  // Chat 1 sub-turn protection: turn_complete arrives within 1.5s -> debounce ready
  sm.processLine('{"role":"model","turn_complete":true,"content":"Done"}', 'chat-1');
  assert.strictEqual(sm.getCurrentState(), 'running', 'Sub-turn within 1.5s stays running during debounce');

  // Wait for 1.5s debounce to fire
  await new Promise((r) => setTimeout(r, 1600));
  assert.strictEqual(sm.getCurrentState(), 'ready', 'Transitions to ready after 1.5s debounce completes');
  console.log('✔ AgentStateMachine global priority resolution & /btw multi-chat protection verified');

  // 4. Test PetEngine audio 2.5s anti-spam cooldown
  const mockCanvas = {
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(100) }),
    }),
    width: 128,
    height: 128,
  };

  let soundPlayCount = 0;
  const engine = new PetEngine(mockCanvas, {
    muted: false,
  });
  const audioSynth = engine.getAudio();
  const originalPlay = audioSynth.playPreset.bind(audioSynth);
  audioSynth.playPreset = (preset) => {
    soundPlayCount++;
    return originalPlay(preset);
  };

  // Rapidly trigger 5 state changes within 50ms
  engine.setState('running');
  engine.setState('needs_input');
  engine.setState('blocked');
  engine.setState('ready');

  // Because of the 2.5s cooldown on state sounds, it should have played at most 1 state transition sound
  assert(soundPlayCount <= 1, `Sound play count should be throttled by 2.5s cooldown (actual: ${soundPlayCount})`);
  console.log('✔ PetEngine 2.5s audio anti-spam cooldown verified');

  // Clean up
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) {}

  console.log('\n🎉 ALL MULTI-SESSION & ANTI-THRASHING TESTS PASSED 100%!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
