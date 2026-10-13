/**
 * desktop-overlay/main/pid-watchdog.ts
 * Process watchdog monitoring parent Antigravity IDE process.
 * Closes the desktop overlay immediately (<500ms) when parent crashes or exits.
 */

import { PID_WATCHDOG_POLL_INTERVAL_MS } from '../../shared/constants';

export interface PIDWatchdogOptions {
  parentPid?: number;
  checkIntervalMs?: number;
  onParentDied: (reason?: string) => void;
}

export class PIDWatchdog {
  private parentPid: number;
  private checkIntervalMs: number;
  private onParentDied: (reason?: string) => void;
  private timer: NodeJS.Timeout | null = null;
  private active = false;
  private detectionTimestamp = 0;

  constructor(options: PIDWatchdogOptions) {
    this.parentPid = options.parentPid ?? 0;
    this.checkIntervalMs = options.checkIntervalMs ?? PID_WATCHDOG_POLL_INTERVAL_MS;
    this.onParentDied = options.onParentDied;

    // Validate PID immediately
    if (!this.parentPid || typeof this.parentPid !== 'number' || this.parentPid <= 0 || !Number.isFinite(this.parentPid)) {
      this.active = false;
      // Trigger callback asynchronously or immediately as required by test contracts
      queueMicrotask(() => {
        this.onParentDied('invalid_pid');
      });
      return;
    }

    this.start();
  }

  /**
   * Starts the periodic polling loop.
   */
  public start(): void {
    if (this.active || this.parentPid <= 0) return;
    this.active = true;

    this.timer = setInterval(() => {
      this.check();
    }, this.checkIntervalMs);
  }

  /**
   * Performs an immediate synchronous PID liveness check.
   */
  public check(): boolean {
    if (!this.active) return false;

    const alive = PIDWatchdog.isPidAlive(this.parentPid);
    if (!alive) {
      this.detectionTimestamp = performance.now();
      this.stop();
      this.onParentDied('parent_process_terminated');
      return false;
    }
    return true;
  }

  /**
   * Stops the watchdog timer. Idempotent and safe against race conditions.
   */
  public stop(): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  public getParentPid(): number {
    return this.parentPid;
  }

  public getDetectionTimestamp(): number {
    return this.detectionTimestamp;
  }

  /**
   * Checks if a process with the given PID is currently active in the OS.
   * Uses signal 0 to test for process existence without sending any termination signal.
   */
  public static isPidAlive(pid: number): boolean {
    if (!pid || typeof pid !== 'number' || pid <= 0 || !Number.isFinite(pid)) {
      return false;
    }

    try {
      // Signal 0 is supported across Windows and POSIX to probe process existence
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      // ESRCH means process does not exist.
      // EPERM means process exists but we lack permission to signal it (e.g., privileged system process).
      return err?.code === 'EPERM';
    }
  }

  /**
   * Factory function providing identical contract to MockAntigravityProcess.startWatchdog.
   */
  public static startWatchdog(options: PIDWatchdogOptions): PIDWatchdog {
    return new PIDWatchdog(options);
  }
}
