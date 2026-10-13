/**
 * workload-7-multi-file-brain-traversal.test.js
 * Tier 4 Workload 7: Multi-File Brain Directory Traversal & Active Transcript Selection
 * Multi-File Brain Directory Traversal & Active Transcript Selection.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TestHarness = require('../harness/test-harness');

function findActiveTranscriptFile(brainRootDir) {
  if (!fs.existsSync(brainRootDir)) return null;

  const entries = fs.readdirSync(brainRootDir, { withFileTypes: true });
  const sessionDirs = entries.filter(e => e.isDirectory()).map(e => path.join(brainRootDir, e.name));

  let newestPath = null;
  let newestMtime = 0;

  for (const dir of sessionDirs) {
    const candidate = path.join(dir, 'transcript.jsonl');
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.mtimeMs > newestMtime) {
        newestMtime = stat.mtimeMs;
        newestPath = candidate;
      }
    }
  }

  return newestPath;
}

module.exports = {
  name: 'Workload 7: Multi-File Brain Traversal',
  tier: 4,
  tests: [
    {
      name: 'test_active_transcript_selection_across_sessions',
      fn: async () => {
        const harness = new TestHarness('Workload 7');
        const tmpDir = harness.createTempDir('brain-traversal-');
        const brainRootDir = path.join(tmpDir, '.gemini', 'antigravity', 'brain');
        fs.mkdirSync(brainRootDir, { recursive: true });

        // 1. Create Old Session A
        const sessionA = path.join(brainRootDir, 'session-aaaa-1111');
        fs.mkdirSync(sessionA, { recursive: true });
        const transcriptA = path.join(sessionA, 'transcript.jsonl');
        fs.writeFileSync(transcriptA, '{"role":"user","content":"Session A historical message"}\n', 'utf8');

        // Delay to ensure mtime difference
        await new Promise(r => setTimeout(r, 60));

        // 2. Create Active Session B
        const sessionB = path.join(brainRootDir, 'session-bbbb-2222');
        fs.mkdirSync(sessionB, { recursive: true });
        const transcriptB = path.join(sessionB, 'transcript.jsonl');
        fs.writeFileSync(transcriptB, '{"role":"user","content":"Session B current message"}\n', 'utf8');

        // 3. Traversal must discover Session B as active
        const active = findActiveTranscriptFile(brainRootDir);
        assert.strictEqual(active, transcriptB, 'Newest session B must be selected as active transcript');

        // 4. Read active line
        const content = fs.readFileSync(active, 'utf8');
        const parsed = TestHarness.parseTranscriptLine(content.trim());
        assert.strictEqual(parsed.state, 'running');

        // 5. Antigravity spawns Session C later
        await new Promise(r => setTimeout(r, 60));
        const sessionC = path.join(brainRootDir, 'session-cccc-3333');
        fs.mkdirSync(sessionC, { recursive: true });
        const transcriptC = path.join(sessionC, 'transcript.jsonl');
        fs.writeFileSync(transcriptC, '{"role":"model","turn_complete":true}\n', 'utf8');

        // 6. Traversal transitions to Session C
        const activeAfterRotation = findActiveTranscriptFile(brainRootDir);
        assert.strictEqual(activeAfterRotation, transcriptC, 'Newest session C must be selected after rotation');

        await harness.cleanup();
      }
    }
  ]
};
