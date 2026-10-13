/**
 * desktop-overlay/main/index.ts
 * Main entrypoint for the Electron desktop overlay application.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { PetConfig, PetScale, StatePayload } from '../../shared/types';
import {
  WINDOW_SPEC,
  DEFAULT_WS_PORT,
} from '../../shared/constants';
import { ConfigManager } from './config';
import { PIDWatchdog } from './pid-watchdog';
import { ClientBridge } from './client-bridge';
import { focusParentWindow } from './window-focus';

function logDebug(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync('d:/Projects/AG_Pet/overlay-debug.log', line);
  } catch (_e) {}
  try {
    fs.appendFileSync('C:/Users/lennielan/AppData/Roaming/ag-pet/overlay-debug.log', line);
  } catch (_e) {}
}

// Typed interfaces for Electron components
export interface ElectronBrowserWindowOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  transparent?: boolean;
  frame?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  resizable?: boolean;
  hasShadow?: boolean;
  webPreferences?: {
    nodeIntegration?: boolean;
    contextIsolation?: boolean;
    preload?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ElectronBrowserWindow {
  loadURL(url: string): Promise<void>;
  loadFile(filePath: string): Promise<void>;
  setPosition(x: number, y: number, animate?: boolean): void;
  getPosition(): [number, number];
  setSize(width: number, height: number, animate?: boolean): void;
  getSize(): [number, number];
  show(): void;
  hide(): void;
  close(): void;
  destroy(): void;
  isDestroyed(): boolean;
  setAlwaysOnTop(alwaysOnTop: boolean, level?: string): void;
  webContents: {
    send(channel: string, ...args: any[]): void;
    openDevTools(): void;
    [key: string]: any;
  };
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
}

export interface ElectronApp {
  whenReady(): Promise<void>;
  quit(): void;
  exit(exitCode?: number): void;
  on(event: string, listener: (...args: any[]) => void): any;
  isReady(): boolean;
  getPath(name: string): string;
  [key: string]: any;
}

let electronModule: any = null;
try {
  electronModule = require('electron');
} catch (_e) {
  // Graceful fallback for non-electron execution environments (e.g. unit tests)
}

const app = electronModule?.app;
const BrowserWindow = electronModule?.BrowserWindow;
const ipcMain = electronModule?.ipcMain;

logDebug(`TOP LEVEL LOAD: require.main === module is ${require.main === module}, app exists: ${Boolean(app)}`);

process.on('uncaughtException', (err: any) => {
  logDebug(`UNCAUGHT EXCEPTION: ${err?.stack || err?.message || err}`);
});

process.on('unhandledRejection', (reason: any) => {
  logDebug(`UNHANDLED REJECTION: ${reason?.stack || reason?.message || reason}`);
});

if (app) {
  app.on('quit', (_e: any, exitCode: any) => {
    logDebug(`app quit event with code ${exitCode}`);
  });
  app.on('will-quit', () => {
    logDebug(`app will-quit event`);
  });
  app.on('window-all-closed', () => {
    logDebug('app window-all-closed event');
  });
}

/**
 * Parses command-line arguments passed from Antigravity extension.
 * Example: --parent-pid=12345 --ws-port=38472
 */
export function parseCommandLineArgs(argv: string[] = process.argv): {
  parentPid?: number;
  wsPort?: number;
} {
  let parentPid: number | undefined;
  let wsPort: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--parent-pid=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(val) && val > 0) parentPid = val;
    } else if (arg === '--parent-pid' && i + 1 < argv.length) {
      const val = parseInt(argv[++i], 10);
      if (Number.isFinite(val) && val > 0) parentPid = val;
    } else if (arg.startsWith('--ws-port=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(val) && val >= 1024 && val <= 65535) wsPort = val;
    } else if (arg === '--ws-port' && i + 1 < argv.length) {
      const val = parseInt(argv[++i], 10);
      if (Number.isFinite(val) && val >= 1024 && val <= 65535) wsPort = val;
    }
  }

  return { parentPid, wsPort };
}

function loadTranscriptModules() {
  const candidates = [
    path.join(__dirname, '../../../extension/dist/extension/src/transcript-watcher'),
    path.join(__dirname, '../../extension/dist/extension/src/transcript-watcher'),
    path.join(process.cwd(), 'extension/dist/extension/src/transcript-watcher'),
  ];
  for (const c of candidates) {
    try {
      const tw = require(c);
      const sm = require(c.replace('transcript-watcher', 'state-machine'));
      if (tw && sm && tw.TranscriptWatcher && sm.AgentStateMachine) {
        return {
          TranscriptWatcher: tw.TranscriptWatcher,
          resolveDefaultBrainDir: tw.resolveDefaultBrainDir,
          AgentStateMachine: sm.AgentStateMachine,
        };
      }
    } catch (_e) {}
  }
  return null;
}

/**
 * Calculates window dimensions according to the pet scale.
 */
export function calculateWindowDimensions(scale: PetScale): { width: number; height: number } {
  const canvasSize = Math.round(64 * 2.0 * scale);
  const width = Math.max(320, canvasSize + 120);
  const height = Math.max(340, canvasSize + 120);
  return { width, height };
}

export class OverlayApplication {
  private configManager: ConfigManager;
  private bridge: ClientBridge | null = null;
  private watchdog: PIDWatchdog | null = null;
  private transcriptWatcher: any = null;
  private stateMachine: any = null;
  private mainWindow: any = null;
  private parentPid?: number;
  private wsPort: number;
  private isPetHidden = false;
  private dragStartCursor: { x: number; y: number } | null = null;
  private dragStartWindowPos: [number, number] | null = null;

  private enforceTopmost = (): void => {
    if (this.isPetHidden) return;
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
      try {
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      } catch (_e) {
        this.mainWindow.setAlwaysOnTop(true);
      }
      if (typeof this.mainWindow.moveTop === 'function') {
        this.mainWindow.moveTop();
      }
    }
  };

  constructor(cliArgs: { parentPid?: number; wsPort?: number } = {}) {
    this.parentPid = cliArgs.parentPid;
    logDebug(`OverlayApplication instantiated with parentPid=${this.parentPid}, wsPort=${cliArgs.wsPort}`);
    this.configManager = new ConfigManager(undefined, {
      parentPid: this.parentPid,
      wsPort: cliArgs.wsPort,
    });

    const config = this.configManager.getConfig();
    this.wsPort = cliArgs.wsPort || config.wsPort || DEFAULT_WS_PORT;
    if (this.parentPid === undefined && config.parentPid) {
      this.parentPid = config.parentPid;
    }
  }

  public async start(): Promise<void> {
    logDebug(`OverlayApplication.start called, app ready: ${Boolean(app)}`);
    if (!app || !BrowserWindow) {
      return;
    }

    try {
      await app.whenReady();
      logDebug('app.whenReady resolved');
      this.initWatchdog();
      logDebug('initWatchdog finished');
      this.initBridge();
      logDebug('initBridge finished');
      this.initAutonomousLogMonitor();
      logDebug('initAutonomousLogMonitor finished');
      this.initWindow();
      logDebug('initWindow finished');
      this.initIpc();
      logDebug('initIpc finished');
    } catch (err: any) {
      logDebug(`CRITICAL START ERROR: ${err?.stack || err?.message || err}`);
    }
  }

  private initWatchdog(): void {
    logDebug(`initWatchdog called, parentPid=${this.parentPid}`);
    if (this.parentPid && this.parentPid > 0) {
      this.watchdog = new PIDWatchdog({
        parentPid: this.parentPid,
        checkIntervalMs: 200,
        onParentDied: (reason?: string) => {
          logDebug(`watchdog onParentDied triggered, reason=${reason}`);
          this.terminate();
        },
      });
    }
  }

  private initBridge(): void {
    this.bridge = new ClientBridge({
      port: this.wsPort,
      autoConnect: true,
    });

    this.bridge.on('error', () => {}); // Prevent unhandled EventEmitter rejection on initial connection attempts

    this.bridge.on('state_update', (payload: StatePayload) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('state_update', payload);
      }
    });

    this.bridge.on('config_update', (config: Partial<PetConfig>) => {
      this.configManager.updateConfig(config);
      this.configManager.save();
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('config_update', config);
      }
    });
  }

  private initAutonomousLogMonitor(): void {
    const modules = loadTranscriptModules();
    if (!modules) {
      logDebug('Autonomous log monitor: modules not found');
      return;
    }

    try {
      const brainDir = modules.resolveDefaultBrainDir();
      this.stateMachine = new modules.AgentStateMachine();
      this.stateMachine.on('state_change', (payload: StatePayload) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('state_update', payload);
        }
      });

      this.transcriptWatcher = new modules.TranscriptWatcher({
        brainRootDir: brainDir,
        pollIntervalMs: 250,
        startFromBeginning: false,
        autoStart: true,
      });

      this.transcriptWatcher.on('line', (line: string) => {
        this.stateMachine?.processLine(line);
      });

      logDebug(`Autonomous transcript watcher started successfully on ${brainDir}`);
    } catch (err: any) {
      logDebug(`Autonomous transcript watcher failed to start: ${err?.message || err}`);
    }
  }

  private initWindow(): void {
    const config = this.configManager.getConfig();
    const { width, height } = calculateWindowDimensions(config.scale);
    let posX = config.x;
    let posY = config.y;

    const screen = electronModule?.screen;
    if (screen) {
      try {
        const primary = screen.getPrimaryDisplay();
        const { width: sW, height: sH } = primary.workAreaSize;
        const defaultX = Math.max(50, sW - width - 40);
        const defaultY = Math.max(50, sH - height - 40);

        // Clamp and restore if off-screen, uninitialized, or stuck in previous centered position
        if (
          posX === undefined ||
          posX === 120 ||
          posX < 0 ||
          posX > sW - 80 ||
          posY === undefined ||
          posY === 120 ||
          posY < 0 ||
          posY > sH - 80 ||
          (Math.abs(posX - 1012.8) < 5 && Math.abs(posY - 364.8) < 5)
        ) {
          posX = defaultX;
          posY = defaultY;
        }
      } catch (_e) {}
    }

    this.mainWindow = new BrowserWindow({
      ...WINDOW_SPEC,
      width,
      height,
      x: Math.round(posX),
      y: Math.round(posY),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    if (typeof this.mainWindow.setIgnoreMouseEvents === 'function') {
      try {
        this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
      } catch (_e) {}
    }

    this.enforceTopmost();

    if (typeof this.mainWindow.setVisibleOnAllWorkspaces === 'function') {
      try {
        this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch (_e) {}
    }
    if (typeof this.mainWindow.show === 'function') {
      this.mainWindow.show();
    }

    const candidatePaths = [
      path.join(__dirname, '../renderer/index.html'),
      path.join(__dirname, '../../renderer/index.html'),
      path.join(process.cwd(), 'desktop-overlay/dist/desktop-overlay/renderer/index.html'),
      path.join(process.cwd(), 'desktop-overlay/renderer/index.html'),
      path.join(__dirname, 'renderer/index.html'),
    ];
    const htmlPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
    logDebug(`loadFile using htmlPath: ${htmlPath}`);
    this.mainWindow.loadFile(htmlPath);

    this.mainWindow.webContents.on('did-finish-load', async () => {
      logDebug('mainWindow did-finish-load: ensuring visible and focused');
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.enforceTopmost();
        logDebug(`WINDOW DIAG: bounds=${JSON.stringify(this.mainWindow.getBounds())}, visible=${this.mainWindow.isVisible()}, isAlwaysOnTop=${this.mainWindow.isAlwaysOnTop()}, isMinimized=${this.mainWindow.isMinimized()}`);
        
        // Wait 500ms for first frames to paint, then capture window pixels
        setTimeout(async () => {
          try {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              const pageImg = await this.mainWindow.webContents.capturePage();
              const pageBuf = pageImg.toPNG();
              const pageCapPath = 'C:/Users/lennielan/AppData/Roaming/ag-pet/window-capture.png';
              fs.writeFileSync(pageCapPath, pageBuf);
              logDebug(`PAGE CAPTURE SAVED: size=${pageBuf.length} bytes, dimensions=${JSON.stringify(pageImg.getSize())}`);
            }
          } catch (capErr: any) {
            logDebug(`PAGE CAPTURE ERROR: ${capErr?.message || capErr}`);
          }
        }, 500);
      }
    });

    // Re-assert topmost whenever focus is lost or shifted to Antigravity
    this.mainWindow.on('blur', this.enforceTopmost);

    // Heartbeat every 2.5 seconds to ensure DWM focus shifts never bury the pet
    const topmostInterval = setInterval(this.enforceTopmost, 2500);

    this.mainWindow.webContents.on('console-message', (_e: any, level: any, message: any, line: any, sourceId: any) => {
      logDebug(`RENDERER [${level}] ${message} (line ${line} in ${sourceId})`);
    });

    this.mainWindow.on('close', () => {
      logDebug(`mainWindow 'close' event fired!`);
    });

    this.mainWindow.on('closed', () => {
      clearInterval(topmostInterval);
      logDebug('mainWindow emitted closed');
      this.mainWindow = null;
    });

    this.mainWindow.webContents.on('did-fail-load', (_e: any, errorCode: any, errorDescription: any) => {
      logDebug(`mainWindow did-fail-load: code=${errorCode}, desc=${errorDescription}`);
    });

    this.mainWindow.webContents.on('render-process-gone', (_e: any, details: any) => {
      logDebug(`mainWindow render-process-gone: ${JSON.stringify(details)}`);
    });
  }

  private initIpc(): void {
    if (!ipcMain) return;

    ipcMain.handle('get_config', () => {
      return this.configManager.getConfig();
    });

    ipcMain.on('save_config', (_event: any, updates: Partial<PetConfig>) => {
      this.configManager.updateConfig(updates);
      this.configManager.save();
      if (this.bridge) {
        this.bridge.sendConfigUpdate(updates);
      }
    });

    ipcMain.on('start_drag', () => {
      const screen = electronModule?.screen;
      if (screen && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.dragStartCursor = screen.getCursorScreenPoint();
        this.dragStartWindowPos = this.mainWindow.getPosition();
      }
    });

    ipcMain.on('drag_move', (_event: any, fallbackX?: number, fallbackY?: number) => {
      const screen = electronModule?.screen;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (screen && this.dragStartCursor && this.dragStartWindowPos) {
          const currentCursor = screen.getCursorScreenPoint();
          const targetX = Math.round(this.dragStartWindowPos[0] + (currentCursor.x - this.dragStartCursor.x));
          const targetY = Math.round(this.dragStartWindowPos[1] + (currentCursor.y - this.dragStartCursor.y));
          const [curX, curY] = this.mainWindow.getPosition();
          // STRICT CHECK: ONLY move window if cursor position actually changed
          if (targetX !== curX || targetY !== curY) {
            this.mainWindow.setPosition(targetX, targetY);
          }
        } else if (typeof fallbackX === 'number' && typeof fallbackY === 'number') {
          this.mainWindow.setPosition(Math.round(fallbackX), Math.round(fallbackY));
        }
      }
    });

    ipcMain.on('end_drag', (_event: any, _finalX?: number, _finalY?: number) => {
      this.dragStartCursor = null;
      this.dragStartWindowPos = null;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const [curX, curY] = this.mainWindow.getPosition();
        this.configManager.updateConfig({ x: curX, y: curY });
        this.configManager.save();
        if (this.bridge) {
          this.bridge.sendConfigUpdate({ x: curX, y: curY });
        }
      }
    });

    ipcMain.on('set_position', (_event: any, x: number, y: number) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const [curX, curY] = this.mainWindow.getPosition();
        const roundX = Math.round(x);
        const roundY = Math.round(y);
        if (roundX !== curX || roundY !== curY) {
          this.mainWindow.setPosition(roundX, roundY);
        }
      }
      this.configManager.updateConfig({ x, y });
    });

    ipcMain.on('set_scale', (_event: any, scale: PetScale) => {
      this.configManager.updateConfig({ scale });
      this.configManager.save();
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const { width, height } = calculateWindowDimensions(scale);
        this.mainWindow.setSize(Math.round(width), Math.round(height));
      }
    });

    ipcMain.on('set_muted', (_event: any, isMuted: boolean) => {
      this.configManager.updateConfig({ isMuted });
      this.configManager.save();
    });

    ipcMain.on('focus_ide', async () => {
      await focusParentWindow({
        parentPid: this.parentPid,
        bridge: this.bridge || undefined,
      });
    });

    ipcMain.on('hide_pet', () => {
      this.isPetHidden = true;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.hide();
      }
    });

    ipcMain.on('show_pet', () => {
      this.isPetHidden = false;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.show();
        this.enforceTopmost();
      }
    });

    ipcMain.on('pet_ready', () => {
      if (this.bridge) {
        this.bridge.sendPetReady();
      }
    });

    ipcMain.on('ag-pet:set-ignore-mouse', (_event: any, ignore: boolean) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && typeof this.mainWindow.setIgnoreMouseEvents === 'function') {
        try {
          this.mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
        } catch (_e) {}
      }
    });

    ipcMain.on('pet_close', () => {
      this.terminate();
    });
  }

  public terminate(): void {
    logDebug('OverlayApplication.terminate() called!');
    if (this.watchdog) {
      this.watchdog.stop();
    }
    if (this.transcriptWatcher && typeof this.transcriptWatcher.stop === 'function') {
      this.transcriptWatcher.stop();
    }
    if (this.bridge) {
      this.bridge.sendPetClose();
      this.bridge.disconnect();
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
    }
    if (app) {
      app.exit(0);
    }
  }

  public getMainWindow(): any {
    return this.mainWindow;
  }

  public getConfigManager(): ConfigManager {
    return this.configManager;
  }

  public getBridge(): ClientBridge | null {
    return this.bridge;
  }

  public getWatchdog(): PIDWatchdog | null {
    return this.watchdog;
  }
}

// Global entry bootstrap when executed in Electron runtime
if (app && typeof app.whenReady === 'function' && process.env.NODE_ENV !== 'test') {
  logDebug('Auto-bootstrapping OverlayApplication in Electron runtime');
  const cliArgs = parseCommandLineArgs();
  const overlayApp = new OverlayApplication(cliArgs);
  overlayApp.start().catch((err) => {
    logDebug(`Failed to start OverlayApplication: ${err?.message || err}`);
    console.error('Failed to start OverlayApplication:', err);
    if (app && typeof app.exit === 'function') {
      app.exit(1);
    }
  });
}
