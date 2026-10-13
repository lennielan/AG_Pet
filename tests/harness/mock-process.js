/**
 * mock-process.js
 * Process lifecycle simulation and PID watchdog validator.
 */

const { spawn } = require('node:child_process');

class MockAntigravityProcess {
  constructor() {
    this.process = null;
    this.pid = null;
    this.isAlive = false;
  }

  /**
   * Spawns a mock parent IDE process.
   */
  async spawn() {
    return new Promise((resolve, reject) => {
      // Spawn a minimal detached node sleep process
      this.process = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
        stdio: 'ignore',
        detached: false
      });

      this.pid = this.process.pid;
      this.isAlive = true;

      this.process.on('exit', () => {
        this.isAlive = false;
      });

      this.process.on('error', (err) => {
        this.isAlive = false;
        reject(err);
      });

      // Small delay to ensure process is active
      setTimeout(() => {
        resolve({ pid: this.pid });
      }, 50);
    });
  }

  /**
   * Checks if any given PID is currently alive in the OS.
   */
  static isPidAlive(pid) {
    if (!pid || typeof pid !== 'number' || pid <= 0) return false;
    try {
      // Signal 0 tests for process existence without killing it
      process.kill(pid, 0);
      return true;
    } catch (e) {
      // ESRCH means process does not exist. EPERM means exists but no permission.
      return e.code === 'EPERM';
    }
  }

  /**
   * Simulates a sudden process crash / hard termination.
   */
  async killCrash() {
    if (this.process && this.isAlive) {
      try {
        if (process.platform === 'win32') {
          // On Windows, tree kill or standard force kill
          this.process.kill('SIGKILL');
        } else {
          this.process.kill('SIGKILL');
        }
      } catch (e) {
        // Ignored if already dead
      }
      this.isAlive = false;
      // Wait for OS table release
      await new Promise(r => setTimeout(r, 100));
    }
  }

  /**
   * Simulates graceful process exit.
   */
  async killGraceful() {
    if (this.process && this.isAlive) {
      try {
        this.process.kill('SIGTERM');
      } catch (e) {
        // Ignored
      }
      this.isAlive = false;
      await new Promise(r => setTimeout(r, 100));
    }
  }

  /**
   * Simulates the overlay PID Watchdog loop.
   * Periodically checks if the parent PID is still alive. If dead, triggers onParentDied.
   */
  static startWatchdog({ parentPid, checkIntervalMs = 50, onParentDied }) {
    let active = true;
    const timer = setInterval(() => {
      if (!active) return;
      const alive = MockAntigravityProcess.isPidAlive(parentPid);
      if (!alive) {
        active = false;
        clearInterval(timer);
        if (typeof onParentDied === 'function') {
          onParentDied();
        }
      }
    }, checkIntervalMs);

    return {
      stop: () => {
        active = false;
        clearInterval(timer);
      }
    };
  }

  cleanup() {
    if (this.process && this.isAlive) {
      try {
        this.process.kill('SIGKILL');
      } catch (e) {}
    }
  }
}

module.exports = MockAntigravityProcess;
