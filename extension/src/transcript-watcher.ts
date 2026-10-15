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
 * Searches the brain root directory for recently active transcript.jsonl files
 * modified within activeWindowMs (default 60s), sorted from oldest to newest,
 * with the single newest file guaranteed to be included.
 */
export function findActiveTranscriptFiles(brainRootDir: string, activeWindowMs = 60000): string[] {
  if (!brainRootDir || !fs.existsSync(brainRootDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(brainRootDir, { withFileTypes: true });
    const sessionDirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        sessionDirs.push(path.join(brainRootDir, entry.name));
      }
    }

    const fileStats: Array<{ path: string; mtimeMs: number }> = [];

    const checkCandidate = (candidate: string) => {
      if (fs.existsSync(candidate)) {
        try {
          const stat = fs.statSync(candidate);
          fileStats.push({ path: candidate, mtimeMs: stat.mtimeMs });
        } catch (_err) {}
      }
    };

    for (const dir of sessionDirs) {
      checkCandidate(path.join(dir, '.system_generated', 'logs', 'transcript.jsonl'));
      checkCandidate(path.join(dir, 'transcript.jsonl'));
    }

    // Direct check if brainRootDir itself has a transcript.jsonl
    checkCandidate(path.join(brainRootDir, '.system_generated', 'logs', 'transcript.jsonl'));
    checkCandidate(path.join(brainRootDir, 'transcript.jsonl'));

    if (fileStats.length === 0) {
      return [];
    }

    // Sort by mtimeMs ascending (oldest first, newest last)
    fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

    const newest = fileStats[fileStats.length - 1];
    const threshold = Date.now() - activeWindowMs;

    const active = fileStats.filter((f) => f.mtimeMs >= threshold || f.path === newest.path);
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of active) {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        result.push(item.path);
      }
    }
    return result;
  } catch (_err) {
    return [];
  }
}

/**
 * Searches the brain root directory for the most recently modified transcript.jsonl file.
 */
export function findActiveTranscriptFile(brainRootDir: string): string | null {
  const active = findActiveTranscriptFiles(brainRootDir);
  return active.length > 0 ? active[active.length - 1] : null;
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
  private fileOffsets: Map<string, number> = new Map();
  private startFromBeginning: boolean;
  private watcherStartTime: number;
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPollingActive: boolean = false;
  private emittedLines: string[] = [];
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readyToIdleTimer: NodeJS.Timeout | null = null;
  private lastSessionMtime: number = 0;

  constructor(options: TranscriptWatcherOptions = {}) {
    super();
    this.brainRootDir = options.brainRootDir || resolveDefaultBrainDir();
    this.pollIntervalMs = options.pollIntervalMs || 250;
    this.startFromBeginning = Boolean(options.startFromBeginning);
    this.watcherStartTime = Date.now();

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
   * Returns the directory of the current active session.
   */
  public getActiveSessionDir(): string | null {
    if (!this.currentFilePath) return null;
    try {
      const normalized = path.resolve(this.currentFilePath);
      const sysGenIndex = normalized.indexOf('.system_generated');
      if (sysGenIndex !== -1) {
        return normalized.substring(0, sysGenIndex - 1);
      }
      return path.dirname(normalized);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Records active agent work: emits 'running', resets 4s inactivity timer,
   * then auto-transitions to 'ready' (for 3s) and back to 'idle'.
   */
  public recordActivity(summary = 'Agent is active'): void {
    if (this.readyToIdleTimer) {
      clearTimeout(this.readyToIdleTimer);
      this.readyToIdleTimer = null;
    }
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    this.emit('activity', {
      state: 'running',
      summary,
      timestamp: Date.now(),
    });

    // 7 seconds of inactivity debounce to allow multi-step tasks to proceed without premature ready
    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null;
      this.emit('activity', {
        state: 'ready',
        summary: 'Task completed',
        timestamp: Date.now(),
      });

      // 1.8 seconds celebration before returning to idle
      this.readyToIdleTimer = setTimeout(() => {
        this.readyToIdleTimer = null;
        this.emit('activity', {
          state: 'idle',
          summary: 'Idle',
          timestamp: Date.now(),
        });
      }, 1800);
      if (typeof this.readyToIdleTimer.unref === 'function') {
        this.readyToIdleTimer.unref();
      }
    }, 7000);

    if (typeof this.inactivityTimer.unref === 'function') {
      this.inactivityTimer.unref();
    }
  }

  public cancelInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.readyToIdleTimer) {
      clearTimeout(this.readyToIdleTimer);
      this.readyToIdleTimer = null;
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
      if (!startFromBeginning && !this.startFromBeginning && fs.existsSync(activeFile)) {
        try {
          initialOffset = fs.statSync(activeFile).size;
        } catch (_err) {
          initialOffset = 0;
        }
      }
      this.currentFilePath = activeFile;
      this.fileOffsets.set(activeFile, initialOffset);
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
    this.cancelInactivityTimer();
    this.isPollingActive = false;
  }

  /**
   * Incremental reader for a specific transcript file using its preserved byte offset.
   */
  private readLinesFromFile(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const stat = fs.statSync(filePath);

      // Initialize offset on first encounter
      if (!this.fileOffsets.has(filePath)) {
        let initialOffset = 0;
        if (!this.startFromBeginning) {
          const createdBeforeStart = stat.birthtimeMs ? stat.birthtimeMs < (this.watcherStartTime - 1000) : false;
          if (stat.size >= 4096 || createdBeforeStart) {
            initialOffset = stat.size;
          } else {
            initialOffset = 0;
          }
        }
        this.fileOffsets.set(filePath, initialOffset);
      }

      let prevOffset = this.fileOffsets.get(filePath)!;

      // Handle file truncation
      if (stat.size < prevOffset) {
        prevOffset = 0;
      }

      if (stat.size === prevOffset) {
        return [];
      }

      const bytesToRead = stat.size - prevOffset;
      const buffer = Buffer.alloc(bytesToRead);

      const fd = fs.openSync(filePath, 'r');
      try {
        fs.readSync(fd, buffer, 0, bytesToRead, prevOffset);
      } finally {
        fs.closeSync(fd);
      }

      this.fileOffsets.set(filePath, stat.size);
      if (filePath === this.currentFilePath) {
        this.lastOffset = stat.size;
      }

      const chunk = buffer.toString('utf8');
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length > 0) {
        for (const line of lines) {
          this.emittedLines.push(line);
          this.emit('line', line, filePath);
        }
        this.emit('lines', lines, filePath);
      }

      return lines;
    } catch (err: any) {
      this.emit('error', err);
      return [];
    }
  }

  /**
   * Performs an incremental tail read of all active transcript files.
   * Handles multi-session concurrency, file rotation, and truncation without history re-reads.
   */
  public poll(): string[] {
    const filesToPoll: string[] = [];

    // 1. Check if brain session directory has active files
    if (this.brainRootDir && fs.existsSync(this.brainRootDir)) {
      const activeFiles = findActiveTranscriptFiles(this.brainRootDir);
      if (activeFiles.length > 0) {
        filesToPoll.push(...activeFiles);
        const newestFile = activeFiles[activeFiles.length - 1];
        if (newestFile !== this.currentFilePath) {
          const oldFile = this.currentFilePath;
          this.currentFilePath = newestFile;
          // Offset is preserved in this.fileOffsets, NEVER reset to 0!
          this.emit('session_changed', newestFile, oldFile);
        }
      }
    }

    // 2. Check if active session directory files are being modified
    const sessionDir = this.getActiveSessionDir();
    if (sessionDir && fs.existsSync(sessionDir)) {
      try {
        const dirStat = fs.statSync(sessionDir);
        if (dirStat.mtimeMs > this.lastSessionMtime) {
          if (this.lastSessionMtime > 0) {
            this.recordActivity('Processing session updates...');
          }
          this.lastSessionMtime = dirStat.mtimeMs;
        }
      } catch (_e) {}
    }

    if (filesToPoll.length === 0 && this.currentFilePath && fs.existsSync(this.currentFilePath)) {
      filesToPoll.push(this.currentFilePath);
    }

    if (filesToPoll.length === 0) {
      return [];
    }

    const allLines: string[] = [];
    for (const filePath of filesToPoll) {
      const lines = this.readLinesFromFile(filePath);
      allLines.push(...lines);
    }

    if (this.currentFilePath && this.fileOffsets.has(this.currentFilePath)) {
      this.lastOffset = this.fileOffsets.get(this.currentFilePath)!;
    }

    return allLines;
  }

  /**
   * Resets watcher to monitor an explicit file path.
   */
  public resetFile(newPath: string, startOffset?: number): void {
    const oldFile = this.currentFilePath;
    this.currentFilePath = newPath;
    let offset = 0;
    if (typeof startOffset === 'number') {
      offset = startOffset;
    } else if (fs.existsSync(newPath)) {
      try {
        offset = this.startFromBeginning ? 0 : fs.statSync(newPath).size;
      } catch (_err) {
        offset = 0;
      }
    } else {
      offset = 0;
    }
    this.fileOffsets.set(newPath, offset);
    this.lastOffset = offset;
    this.emit('session_changed', newPath, oldFile);
  }

  public getOffset(filePath?: string): number {
    if (filePath && this.fileOffsets.has(filePath)) {
      return this.fileOffsets.get(filePath)!;
    }
    return this.lastOffset;
  }

  public setOffset(offset: number, filePath?: string): void {
    this.lastOffset = Math.max(0, offset);
    const targetFile = filePath || this.currentFilePath;
    if (targetFile) {
      this.fileOffsets.set(targetFile, this.lastOffset);
    }
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
