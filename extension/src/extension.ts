/**
 * extension/src/extension.ts
 * Main entry point for the AG Pet Antigravity IDE Extension.
 *
 * Coordinates:
 *   1. ProcessLauncher - Spawns desktop overlay with parent PID and IPC port.
 *   2. TranscriptWatcher - Monitors active brain session transcript.jsonl.
 *   3. AgentStateMachine - Extracts real-time agent execution states and activity summaries.
 *   4. ServerBridge - WebSocket server broadcasting state events to desktop overlay.
 */

import { ProcessLauncher, ProcessLauncherOptions } from './process-launcher';
import { TranscriptWatcher, TranscriptWatcherOptions } from './transcript-watcher';
import { AgentStateMachine, StateMachineOptions } from './state-machine';
import { ServerBridge, ServerBridgeOptions } from './server-bridge';
import { StatePayload, PetConfig } from '../../shared/types';
import { DEFAULT_WS_PORT } from '../../shared/constants';

export interface ExtensionOptions {
  parentPid?: number;
  wsPort?: number;
  brainRootDir?: string;
  overlayBinaryPath?: string;
  autoSpawnOverlay?: boolean;
}

export class AntigravityExtension {
  public readonly launcher: ProcessLauncher;
  public readonly watcher: TranscriptWatcher;
  public readonly stateMachine: AgentStateMachine;
  public readonly bridge: ServerBridge;
  private isActive: boolean = false;
  private currentPort: number = 0;

  constructor(options: ExtensionOptions = {}) {
    const parentPid = options.parentPid || process.pid;
    const wsPort = options.wsPort || 0;

    this.launcher = new ProcessLauncher({
      parentPid,
      wsPort,
      binaryPath: options.overlayBinaryPath,
    });

    this.watcher = new TranscriptWatcher({
      brainRootDir: options.brainRootDir,
    });

    this.stateMachine = new AgentStateMachine();

    this.bridge = new ServerBridge({
      port: wsPort,
    });

    this.setupEventPipes();
  }

  /**
   * Connects events between the transcript watcher, state machine, and bridge.
   */
  private setupEventPipes(): void {
    // 1. Transcript lines -> State Machine -> WebSocket Bridge
    this.watcher.on('line', (line: string, filePath?: string) => {
      const payload = this.stateMachine.processLine(line, filePath);
      if (payload) {
        this.bridge.broadcast(payload);
        if (payload.state === 'needs_input' || payload.state === 'blocked' || payload.state === 'ready') {
          this.watcher.cancelInactivityTimer();
        } else if (payload.state === 'running' || payload.state === 'thinking') {
          this.watcher.recordActivity(payload.summary);
        }
      } else {
        // Line didn't have an explicit recognized state key -> trigger activity debouncing
        this.watcher.recordActivity();
      }
    });

    // 2. File/Session Activity events -> State Machine
    this.watcher.on('activity', (payload: StatePayload) => {
      const current = this.stateMachine.getCurrentState();
      if (current !== 'blocked' && current !== 'needs_input') {
        this.stateMachine.transitionTo(payload.state, payload.summary, payload.metadata);
      }
    });

    // 3. Direct State changes -> WebSocket Bridge
    this.stateMachine.on('state_change', (payload: StatePayload) => {
      this.bridge.broadcast(payload);
    });

    // 3. Client commands from Desktop Overlay
    this.bridge.on('focus_ide', () => {
      this.focusIde();
    });

    this.bridge.on('pet_ready', () => {
      // Pet overlay has connected and completed initial mount
      const current = this.stateMachine.getCurrentPayload();
      this.bridge.broadcast(current);
    });

    this.bridge.on('pet_close', () => {
      this.launcher.deactivate();
    });

    // 4. Fault tolerance handlers
    this.launcher.on('error', (_err) => {});
    this.watcher.on('error', (_err) => {});
  }

  /**
   * Activates the extension: opens bridge, starts watcher, and spawns overlay.
   */
  public async activate(context?: any): Promise<{
    port: number;
    spawnedProcess: any;
    args: string[];
  }> {
    if (this.isActive) {
      return {
        port: this.currentPort,
        spawnedProcess: this.launcher.getSpawnedProcess(),
        args: [
          `--parent-pid=${process.pid}`,
          `--ws-port=${this.currentPort}`,
          '--mode=overlay',
        ],
      };
    }

    // 1. Allocate port and start WebSocket server bridge
    const port = await this.launcher.findAvailablePort(DEFAULT_WS_PORT);
    this.currentPort = await this.bridge.listen(port);

    // 2. Start transcript watcher
    this.watcher.start();

    // 3. Spawn desktop pet overlay
    const spawnedProcess = await this.launcher.spawnOverlay(undefined, process.pid, this.currentPort);

    this.isActive = true;

    // 4. Register VS Code commands if running inside VS Code / Antigravity host
    if (context && Array.isArray(context.subscriptions)) {
      this.registerVsCodeIntegration(context);
    }

    return {
      port: this.currentPort,
      spawnedProcess,
      args: [
        `--parent-pid=${process.pid}`,
        `--ws-port=${this.currentPort}`,
        '--mode=overlay',
      ],
    };
  }

  /**
   * Cleanly deactivates the extension: terminates overlay, closes bridge and watcher.
   */
  public async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    // 1. Cleanly terminate pet overlay process
    this.launcher.deactivate();

    // 2. Stop transcript tailing
    this.watcher.stop();

    // 3. Close WebSocket server bridge
    await this.bridge.close();
  }

  /**
   * Brings Antigravity IDE into the foreground.
   */
  public focusIde(): void {
    let vscodeModule: any = null;
    try {
      vscodeModule = require('vscode');
    } catch (_e) {}

    if (vscodeModule?.commands) {
      vscodeModule.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    }

    // Windows shell activation fallback
    if (process.platform === 'win32') {
      try {
        const { exec } = require('node:child_process');
        exec(`powershell -Command "(New-Object -ComObject WScript.Shell).AppActivate(${process.pid})"`);
      } catch (_e) {}
    }
  }

  /**
   * Registers VS Code commands and subscriptions.
   */
  private registerVsCodeIntegration(context: any): void {
    let vscodeModule: any = null;
    try {
      vscodeModule = require('vscode');
    } catch (_e) {}

    if (!vscodeModule?.commands) return;

    const toggleCmd = vscodeModule.commands.registerCommand('agPet.toggle', () => {
      if (this.launcher.isAlive()) {
        this.launcher.deactivate();
      } else {
        this.launcher.spawnOverlay(undefined, process.pid, this.currentPort);
      }
    });

    const restartCmd = vscodeModule.commands.registerCommand('agPet.restart', async () => {
      this.launcher.deactivate();
      await this.launcher.spawnOverlay(undefined, process.pid, this.currentPort);
    });

    const focusCmd = vscodeModule.commands.registerCommand('agPet.focusIde', () => {
      this.focusIde();
    });

    context.subscriptions.push(toggleCmd, restartCmd, focusCmd, {
      dispose: () => this.deactivate(),
    });
  }

  public getIsActive(): boolean {
    return this.isActive;
  }

  public getPort(): number {
    return this.currentPort;
  }
}

// Module-level singleton instance for VS Code lifecycle
let globalExtensionInstance: AntigravityExtension | null = null;

export async function activate(context?: any): Promise<any> {
  if (!globalExtensionInstance) {
    globalExtensionInstance = new AntigravityExtension();
  }
  return await globalExtensionInstance.activate(context);
}

export async function deactivate(): Promise<void> {
  if (globalExtensionInstance) {
    await globalExtensionInstance.deactivate();
    globalExtensionInstance = null;
  }
}

export {
  ProcessLauncher,
  TranscriptWatcher,
  AgentStateMachine,
  ServerBridge,
};
