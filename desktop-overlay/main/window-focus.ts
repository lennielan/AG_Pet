/**
 * desktop-overlay/main/window-focus.ts
 * Brings the parent Antigravity IDE window to the foreground when clicking the pet.
 */

import { exec } from 'node:child_process';
import { ClientBridge } from './client-bridge';
import { PIDWatchdog } from './pid-watchdog';

export interface FocusOptions {
  parentPid?: number;
  bridge?: ClientBridge;
  debounceMs?: number;
}

export interface FocusResult {
  success: boolean;
  method: 'bridge' | 'windows_api' | 'debounced' | 'failed' | 'noop';
  error?: string;
}

export class WindowFocusManager {
  private lastFocusTime = 0;
  private debounceMs: number;
  private focusCount = 0;

  constructor(debounceMs = 250) {
    this.debounceMs = debounceMs;
  }

  /**
   * Focuses the parent Antigravity IDE window using the best available channel.
   */
  public async focus(options: FocusOptions): Promise<FocusResult> {
    const now = Date.now();
    const debounceWindow = options.debounceMs ?? this.debounceMs;

    if (now - this.lastFocusTime < debounceWindow) {
      return { success: false, method: 'debounced' };
    }

    this.lastFocusTime = now;
    this.focusCount++;

    let bridgeDispatched = false;

    // Primary channel: Dispatch typed IPC message over WebSocket bridge if connected
    if (options.bridge && options.bridge.isConnected()) {
      bridgeDispatched = options.bridge.sendFocusRequest();
    }

    // Secondary / Direct OS channel: Bring parent window to foreground on Windows
    if (process.platform === 'win32' && options.parentPid && options.parentPid > 0) {
      if (!PIDWatchdog.isPidAlive(options.parentPid)) {
        return {
          success: bridgeDispatched,
          method: bridgeDispatched ? 'bridge' : 'failed',
          error: 'Parent PID is not active',
        };
      }

      try {
        const winResult = await this.activateWindowsWindow(options.parentPid);
        return {
          success: winResult || bridgeDispatched,
          method: winResult ? 'windows_api' : (bridgeDispatched ? 'bridge' : 'failed'),
        };
      } catch (err: any) {
        return {
          success: bridgeDispatched,
          method: bridgeDispatched ? 'bridge' : 'failed',
          error: err?.message,
        };
      }
    }

    if (bridgeDispatched) {
      return { success: true, method: 'bridge' };
    }

    return {
      success: false,
      method: 'noop',
      error: 'No parent PID or active bridge available for window focus',
    };
  }

  /**
   * Activates a Windows process window by PID using WScript.Shell AppActivate.
   */
  private activateWindowsWindow(pid: number): Promise<boolean> {
    return new Promise((resolve) => {
      // Use standard Windows PowerShell command with COM object AppActivate
      const cmd = `powershell -NoProfile -NonInteractive -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.AppActivate(${pid})"`;

      exec(cmd, { timeout: 1500, windowsHide: true }, (err, stdout) => {
        if (err) {
          return resolve(false);
        }
        // stdout will typically contain 'True' if window was brought to foreground
        const trimmed = stdout.trim();
        resolve(trimmed.toLowerCase().includes('true') || !err);
      });
    });
  }

  public getFocusCount(): number {
    return this.focusCount;
  }

  public resetDebounce(): void {
    this.lastFocusTime = 0;
  }
}

/**
 * Singleton focus manager instance for simple procedural invocation.
 */
export const defaultFocusManager = new WindowFocusManager();

export function focusParentWindow(options: FocusOptions): Promise<FocusResult> {
  return defaultFocusManager.focus(options);
}
