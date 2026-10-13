/**
 * f12-transcript-boundaries.test.js
 * Feature 12 Boundaries: Transcript Watcher & Parsing
 * Validates zero-byte empty files, initial tail offsets, corrupted line skips,
 * UTF-8 emoji and international characters, and log truncation recovery.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const TestHarness = require('../harness/test-harness');

function createRobustWatcher(filePath) {
  let offset = 0;

  const poll = () => {
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.statSync(filePath);

    // File was truncated or rotated to smaller size
    if (stat.size < offset) {
      offset = 0;
    }
    if (stat.size === offset) return [];

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    offset = stat.size;

    const text = buf.toString('utf8');
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    return lines;
  };

  return { poll, getOffset: () => offset, setOffset: (o) => { offset = o; } };
}

module.exports = {
  name: 'F12 Boundaries: Transcript Watcher & Parsing',
  tier: 2,
  tests: [
    {
      name: 'test_transcript_zero_byte_empty_file',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();
        const watcher = createRobustWatcher(filePath);

        const read = watcher.poll();
        assert.deepStrictEqual(read, []);
        assert.strictEqual(watcher.getOffset(), 0);

        await harness.cleanup();
      }
    },
    {
      name: 'test_transcript_huge_file_initial_tail',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();

        // Write 100 historical lines
        for (let i = 0; i < 100; i++) {
          gen.append({ role: 'user', content: `Historical message ${i}` });
        }

        const initialSize = fs.statSync(filePath).size;
        const watcher = createRobustWatcher(filePath);
        // Start tailing from current end of file (tail -f behavior)
        watcher.setOffset(initialSize);

        // Append new active line
        gen.appendUserInput('New active command');
        const read = watcher.poll();

        assert.strictEqual(read.length, 1);
        assert(read[0].includes('New active command'));

        await harness.cleanup();
      }
    },
    {
      name: 'test_transcript_corrupted_json_line_skip',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();
        const watcher = createRobustWatcher(filePath);

        // Append a corrupted line followed by a valid line
        gen.appendCorruptedBytes('{ "broken_json": true, [unclosed');
        gen.appendToolCall('npm_test');

        const lines = watcher.poll();
        assert.strictEqual(lines.length, 2);

        // Attempt JSON parse on each
        const parsed = lines.map(l => {
          try { return JSON.parse(l); } catch (e) { return null; }
        });

        assert.strictEqual(parsed[0], null, 'First line was corrupted');
        assert.notStrictEqual(parsed[1], null, 'Second line must parse cleanly');

        await harness.cleanup();
      }
    },
    {
      name: 'test_transcript_unicode_and_emoji_handling',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();
        const watcher = createRobustWatcher(filePath);

        const specialContent = 'Building 🚀 with ★ star rating for 東京都 / München';
        gen.appendUserInput(specialContent);

        const lines = watcher.poll();
        assert.strictEqual(lines.length, 1);
        const obj = JSON.parse(lines[0]);
        assert.strictEqual(obj.content, specialContent, 'UTF-8 emojis and multilingual chars preserved');

        await harness.cleanup();
      }
    },
    {
      name: 'test_transcript_file_truncation_or_overwrite',
      fn: async () => {
        const harness = new TestHarness();
        const gen = harness.createTranscriptGenerator();
        const filePath = gen.initSession();
        const watcher = createRobustWatcher(filePath);

        gen.appendUserInput('Initial long message that creates large file offset');
        watcher.poll();
        const oldOffset = watcher.getOffset();
        assert(oldOffset > 0);

        // File truncated to 0 bytes and new short line appended
        fs.writeFileSync(filePath, '{"role":"user","content":"Reset"}\n', 'utf8');
        const read = watcher.poll();

        assert.strictEqual(read.length, 1);
        assert(read[0].includes('Reset'));

        await harness.cleanup();
      }
    }
  ]
};
