/**
 * extension/src/transcript-watcher.ts
 * Real-time incremental log tailer monitoring Antigravity brain sessions.
 *
 * Discovers the active session directory, performs incremental byte-offset tailing,
 * recovers from file truncation/rotation, and gracefully skips corrupt lines.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';

export interface TranscriptWatcherOptions {
  brainRootDir?: string;
  initialFilePath?: string;
  pollIntervalMs?: number;
  startFromBeginning?: boolean;
  autoStart?: boolean;
}

/**
 * Searches the brain root directory for the most recently modified transcript.jsonl file.
 */
export function findActiveTranscriptFile(brainRootDir: string): string | null {
  if (!brainRootDir || !fs.existsSync(brainRootDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(brainRootDir, { withFileTypes: true });
    const sessionDirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        sessionDirs.push(path.join(brainRootDir, entry.name));
      }
    }

    let newestPath: string | null = null;
    let newestMtime = 0;

    for (const dir of sessionDirs) {
      const candidates = [
        path.join(dir, '.system_generated', 'logs', 'transcript.jsonl'),
        path.join(dir, 'transcript.jsonl'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            const stat = fs.statSync(candidate);
            if (stat.mtimeMs > newestMtime) {
              newestMtime = stat.mtimeMs;
              newestPath = candidate;
            }
          } catch (_err) {
            // File access race condition, ignore candidate
          }
        }
      }
    }

    // Direct check if brainRootDir itself has a transcript.jsonl
    const directCandidates = [
      path.join(brainRootDir, '.system_generated', 'logs', 'transcript.jsonl'),
      path.join(brainRootDir, 'transcript.jsonl'),
    ];
    for (const directCandidate of directCandidates) {
      if (fs.existsSync(directCandidate)) {
        try {
          const stat = fs.statSync(directCandidate);
          if (stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
            newestPath = directCandidate;
          }
        } catch (_err) {}
      }
    }

    return newestPath;
  } catch (_err) {
    return null;
  }
}

/**
 * Resolves the default Antigravity brain directory path based on environment and OS.
 */
export function resolveDefaultBrainDir(): string {
  if (process.env.ANTIGRAVITY_BRAIN_PATH && fs.existsSync(process.env.ANTIGRAVITY_BRAIN_PATH)) {
    return process.env.ANTIGRAVITY_BRAIN_PATH;
  }

  const homeDir = os.homedir();

  // Standard Unix & Windows user path: ~/.gemini/antigravity/brain
  const standardBrain = path.join(homeDir, '.gemini', 'antigravity', 'brain');
  if (fs.existsSync(standardBrain)) {
    return standardBrain;
  }

  // Windows User Profile path check
  if (process.env.USERPROFILE) {
    const winBrain = path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'brain');
    if (fs.existsSync(winBrain)) {
      return winBrain;
    }
  }

  // Return standard default even if not yet created
  return standardBrain;
}

export class TranscriptWatcher extends EventEmitter {
  private brainRootDir: string;
  private currentFilePath: string | null = null;
  private lastOffset: number = 0;
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPollingActive: boolean = false;
  private emittedLines: string[] = [];

  constructor(options: TranscriptWatcherOptions = {}) {
    super();
    this.brainRootDir = options.brainRootDir || resolveDefaultBrainDir();
    this.pollIntervalMs = options.pollIntervalMs || 250;

    if (options.initialFilePath) {
      this.resetFile(options.initialFilePath, options.startFromBeginning ? 0 : undefined);
    } else {
      this.discoverAndAttachFile(options.startFromBeginning);
    }

    if (options.autoStart) {
      this.start();
    }
  }

  /**
   * Discovers the latest active transcript file in the brain root directory.
   */
  public discoverAndAttachFile(startFromBeginning: boolean = false): string | null {
    const activeFile = findActiveTranscriptFile(this.brainRootDir);
    if (activeFile && activeFile !== this.currentFilePath) {
      const oldFile = this.currentFilePath;
      let initialOffset = 0;
      if (!startFromBeginning && fs.existsSync(activeFile)) {
        try {
          initialOffset = fs.statSync(activeFile).size;
        } catch (_err) {
          initialOffset = 0;
        }
      }
      this.currentFilePath = activeFile;
      this.lastOffset = initialOffset;
      this.emit('session_changed', activeFile, oldFile);
    }
    return this.currentFilePath;
  }

  /**
   * Starts periodic polling for new transcript entries.
   */
  public start(): void {
    if (this.isPollingActive) return;
    this.isPollingActive = true;

    this.pollTimer = setInterval(() => {
      try {
        this.poll();
      } catch (err: any) {
        this.emit('error', err);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stops periodic polling.
   */
  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPollingActive = false;
  }

  /**
   * Performs a single incremental tail read of the current transcript file.
   * Handles file rotation, truncation, and atomic multiline appends.
   */
  public poll(): string[] {
    // 1. Check if session has rotated to a newer directory
    if (this.brainRootDir && fs.existsSync(this.brainRootDir)) {
      const newestFile = findActiveTranscriptFile(this.brainRootDir);
      if (newestFile && newestFile !== this.currentFilePath) {
        const oldFile = this.currentFilePath;
        this.currentFilePath = newestFile;
        this.lastOffset = 0; // New session starts from 0
        this.emit('session_changed', newestFile, oldFile);
      }
    }

    if (!this.currentFilePath || !fs.existsSync(this.currentFilePath)) {
      return [];
    }

    try {
      const stat = fs.statSync(this.currentFilePath);

      // Handle file truncation or file replacement
      if (stat.size < this.lastOffset) {
        this.lastOffset = 0;
      }

      if (stat.size === this.lastOffset) {
        return [];
      }

      const bytesToRead = stat.size - this.lastOffset;
      const buffer = Buffer.alloc(bytesToRead);

      const fd = fs.openSync(this.currentFilePath, 'r');
      try {
        fs.readSync(fd, buffer, 0, bytesToRead, this.lastOffset);
      } finally {
        fs.closeSync(fd);
      }

      this.lastOffset = stat.size;

      const chunk = buffer.toString('utf8');
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length > 0) {
        for (const line of lines) {
          this.emittedLines.push(line);
          this.emit('line', line);
        }
        this.emit('lines', lines);
      }

      return lines;
    } catch (err: any) {
      this.emit('error', err);
      return [];
    }
  }

  /**
   * Resets watcher to monitor an explicit file path.
   */
  public resetFile(newPath: string, startOffset?: number): void {
    const oldFile = this.currentFilePath;
    this.currentFilePath = newPath;
    if (typeof startOffset === 'number') {
      this.lastOffset = startOffset;
    } else if (fs.existsSync(newPath)) {
      try {
        this.lastOffset = fs.statSync(newPath).size;
      } catch (_err) {
        this.lastOffset = 0;
      }
    } else {
      this.lastOffset = 0;
    }
    this.emit('session_changed', newPath, oldFile);
  }

  public getOffset(): number {
    return this.lastOffset;
  }

  public setOffset(offset: number): void {
    this.lastOffset = Math.max(0, offset);
  }

  public getCurrentFile(): string | null {
    return this.currentFilePath;
  }

  public getBrainRootDir(): string {
    return this.brainRootDir;
  }

  public getEmittedLines(): string[] {
    return [...this.emittedLines];
  }

  public isRunning(): boolean {
    return this.isPollingActive;
  }
}
