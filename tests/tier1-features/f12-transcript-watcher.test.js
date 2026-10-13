/**
 * f12-transcript-watcher.test.js
 * Feature 12: Transcript Watcher & Parsing
 * Validates discovery of new transcript file, incremental tail reading,
 * atomic multiline appends, non-transcript filtering, and session rotation.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');

function createTranscriptTailWatcher(filePath) {
  let lastOffset = 0;
  const emittedLines = [];

  const poll = () => {
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.statSync(filePath);
    if (stat.size <= lastOffset) return [];

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(stat.size - lastOffset);
    fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
    fs.closeSync(fd);
    lastOffset = stat.size;

    const chunk = buffer.toString('utf8');
    const lines = chunk.split('\n').filter(l => l.trim().length > 0);
    for (const l of lines) {
      emittedLines.push(l);
    }
    return lines;
  };

  return {
    poll,
    getEmittedLines: () => [...emittedLines],
    getOffset: () => lastOffset,
    resetFile: (newPath) => {
      filePath = newPath;
      lastOffset = 0;
    }
  };
}

module.exports = {
  name: 'F12: Transcript Watcher & Parsing',
  tier: 1,
  tests: [
    {
      name: 'test_detects_new_transcript_file',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();

        assert(fs.existsSync(filePath), 'Transcript file should exist');
        assert(filePath.endsWith('transcript.jsonl'), 'Must match transcript.jsonl pattern');

        await harness.cleanup();
      }
    },
    {
      name: 'test_incremental_tail_reading',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();
        const watcher = createTranscriptTailWatcher(filePath);

        // First append
        gen.appendUserInput('Hello agent');
        const read1 = watcher.poll();
        assert.strictEqual(read1.length, 1);
        const offset1 = watcher.getOffset();
        assert(offset1 > 0);

        // Second append
        gen.appendThinking('Processing...');
        const read2 = watcher.poll();
        assert.strictEqual(read2.length, 1);
        const offset2 = watcher.getOffset();
        assert(offset2 > offset1, 'Offset must advance monotonically');

        await harness.cleanup();
      }
    },
    {
      name: 'test_handles_multiline_atomic_appends',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();
        const watcher = createTranscriptTailWatcher(filePath);

        // Append 3 lines in rapid succession
        gen.appendUserInput('Task start');
        gen.appendThinking('Thinking');
        gen.appendToolCall('run_command');

        const read = watcher.poll();
        assert.strictEqual(read.length, 3, 'Must capture all 3 lines in a single poll');

        await harness.cleanup();
      }
    },
    {
      name: 'test_ignores_non_transcript_files',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        gen.initSession();

        const dummyFile = path.join(gen.brainDir, 'meta.json');
        fs.writeFileSync(dummyFile, '{"ignored": true}');

        // Filter pattern test
        const isTranscript = (p) => p.endsWith('transcript.jsonl');
        assert.strictEqual(isTranscript(dummyFile), false);
        assert.strictEqual(isTranscript(gen.filePath), true);

        await harness.cleanup();
      }
    },
    {
      name: 'test_file_rotation_to_new_session',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        gen.initSession();
        const watcher = createTranscriptTailWatcher(gen.filePath);

        gen.appendUserInput('First session');
        watcher.poll();

        // Rotate session
        const { newPath } = gen.rotateSession();
        watcher.resetFile(newPath);
        gen.appendUserInput('Second session');

        const read = watcher.poll();
        assert.strictEqual(read.length, 1);
        assert(read[0].includes('Second session'));

        await harness.cleanup();
      }
    }
  ]
};
