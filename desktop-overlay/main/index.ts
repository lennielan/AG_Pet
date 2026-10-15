/**
 * desktop-overlay/main/index.ts
 * Main entrypoint for the Electron desktop overlay application.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import { PetConfig, PetScale, StatePayload } from '../../shared/types';
import {
  WINDOW_SPEC,
  DEFAULT_WS_PORT,
} from '../../shared/constants';
import { ConfigManager } from './config';
import { PIDWatchdog } from './pid-watchdog';
import { ClientBridge } from './client-bridge';
import { focusParentWindow } from './window-focus';

function truncateLogFileIfNeeded(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 100 * 1024) {
        fs.writeFileSync(filePath, `[${new Date().toISOString()}] Log truncated on startup (was ${stats.size} bytes)\n`);
      }
    }
  } catch (_e) {}
}
truncateLogFileIfNeeded('d:/Projects/AG_Pet/overlay-debug.log');
truncateLogFileIfNeeded('C:/Users/lennielan/AppData/Roaming/ag-pet/overlay-debug.log');

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
const Tray = electronModule?.Tray;
const Menu = electronModule?.Menu;
const nativeImage = electronModule?.nativeImage;
const globalShortcut = electronModule?.globalShortcut;

if (app && app.commandLine) {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64');
  app.commandLine.appendSwitch('disable-http-cache');
  app.commandLine.appendSwitch('disable-GPU-shader-disk-cache');
  app.commandLine.appendSwitch('renderer-process-limit', '1');
}

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
  const height = Math.max(360, canvasSize + 140);
  return { width, height };
}

/**
 * Detects the active Antigravity root process with an open visible window.
 */
export function findAntigravityWindowPid(): number | null {
  if (process.platform !== 'win32') return null;

  for (const exeName of ['Antigravity.exe', 'Antigravity IDE.exe']) {
    try {
      const out = child_process.execSync(`tasklist /V /FI "IMAGENAME eq ${exeName}" /FO CSV /NH`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 2000,
      });
      const lines = out.split('\n');
      for (const line of lines) {
        if (!line.includes(exeName)) continue;
        const parts = line.split('","').map((p) => p.replace(/"/g, '').trim());
        if (parts.length >= 9) {
          const pid = parseInt(parts[1], 10);
          const title = parts[8];
          if (Number.isFinite(pid) && pid > 0 && title && title !== 'N/A' && title !== 'OleMainThreadWndName') {
            return pid;
          }
        }
      }
    } catch (_e) {}
  }

  try {
    const psCmd = `powershell -NoProfile -NonInteractive -Command "$p = Get-Process -Name 'Antigravity','Antigravity IDE' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { $p.Id }"`;
    const out = child_process.execSync(psCmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 2000,
    }).trim();
    const pid = parseInt(out, 10);
    if (Number.isFinite(pid) && pid > 0) return pid;
  } catch (_e) {}

  return null;
}

export class OverlayApplication {
  private configManager: ConfigManager;
  private bridge: ClientBridge | null = null;
  private watchdog: PIDWatchdog | null = null;
  private transcriptWatcher: any = null;
  private stateMachine: any = null;
  private mainWindow: any = null;
  private tray: any = null;
  private parentPid?: number;
  private wsPort: number;
  private isPetHidden = false;
  private isSendingChatMessage = false;
  private dragStartCursor: { x: number; y: number } | null = null;
  private dragStartWindowPos: [number, number] | null = null;
  private lastActiveAgPid: number | null = null;
  private lastActiveAgHwnd: string | null = null;

  private enforceTopmost = (): void => {
    if (this.isPetHidden || this.isSendingChatMessage) return;
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

    // If parentPid was not provided on CLI, dynamically locate current visible Antigravity window
    if (!this.parentPid) {
      const detected = findAntigravityWindowPid();
      if (detected) {
        this.parentPid = detected;
        logDebug(`Dynamically detected Antigravity window PID: ${detected}`);
      }
    }

    this.configManager = new ConfigManager(undefined, {
      parentPid: this.parentPid,
      wsPort: cliArgs.wsPort,
    });

    const config = this.configManager.getConfig();
    this.wsPort = cliArgs.wsPort || config.wsPort || DEFAULT_WS_PORT;
    // Strictly do NOT load parentPid from config file
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
      this.initTray();
      logDebug('initTray finished');
      this.initGlobalShortcuts();
      logDebug('initGlobalShortcuts finished');
      this.initIpc();
      logDebug('initIpc finished');
      if (process.platform === 'win32' && !this.isAutoStartEnabled()) {
        this.setAutoStartEnabled(true);
      }
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

  private lastForwardedKey: string = '';
  private lastForwardedTime: number = 0;
  private hasActiveBridgeConnection: boolean = false;

  private forwardStateUpdate(payload: StatePayload, source: 'bridge' | 'watcher'): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // If bridge (IDE extension) is actively connected, ignore autonomous watcher duplicates
    if (source === 'watcher' && this.hasActiveBridgeConnection) {
      return;
    }

    // 300ms deduplication window on identical (state + summary)
    const key = `${payload.state}:::${payload.summary}`;
    const now = Date.now();
    if (key === this.lastForwardedKey && now - this.lastForwardedTime < 300) {
      return;
    }

    this.lastForwardedKey = key;
    this.lastForwardedTime = now;
    this.mainWindow.webContents.send('state_update', payload);
  }

  private initBridge(): void {
    this.bridge = new ClientBridge({
      port: this.wsPort,
      autoConnect: true,
    });

    this.bridge.on('error', () => {}); // Prevent unhandled EventEmitter rejection on initial connection attempts

    this.bridge.on('connected', () => {
      this.hasActiveBridgeConnection = true;
    });

    this.bridge.on('disconnected', () => {
      this.hasActiveBridgeConnection = false;
    });

    this.bridge.on('state_update', (payload: StatePayload) => {
      this.hasActiveBridgeConnection = true;
      this.forwardStateUpdate(payload, 'bridge');
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
        this.forwardStateUpdate(payload, 'watcher');
      });

      this.transcriptWatcher = new modules.TranscriptWatcher({
        brainRootDir: brainDir,
        pollIntervalMs: 250,
        startFromBeginning: false,
        autoStart: true,
      });

      this.transcriptWatcher.on('line', (line: string, filePath?: string) => {
        this.stateMachine?.processLine(line, filePath);
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
      }
    });

    // Re-assert topmost and close context menu whenever focus is lost
    this.mainWindow.on('blur', () => {
      this.enforceTopmost();
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          this.mainWindow.webContents.send('close_context_menu');
          if (typeof this.mainWindow.setIgnoreMouseEvents === 'function') {
            this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
          }
        } catch (_e) {}
      }
    });

    // Heartbeat every 2.5 seconds to ensure DWM focus shifts never bury the pet
    const topmostInterval = setInterval(this.enforceTopmost, 2500);

    this.mainWindow.webContents.on('console-message', (_e: any, level: any, message: any, line: any, sourceId: any) => {
      if (level >= 2) {
        logDebug(`RENDERER [${level}] ${message} (line ${line} in ${sourceId})`);
      }
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
      this.setScale(scale);
    });

    ipcMain.on('set_muted', (_event: any, isMuted: boolean) => {
      this.configManager.updateConfig({ isMuted });
      this.configManager.save();
      this.updateTrayMenu();
    });

    ipcMain.on('focus_ide', async () => {
      await focusParentWindow({
        parentPid: this.parentPid,
        bridge: this.bridge || undefined,
      });
    });

    ipcMain.on('hide_pet', () => {
      this.hidePet();
    });

    ipcMain.on('show_pet', () => {
      this.showPet();
    });

    ipcMain.on('pet_ready', () => {
      if (this.bridge) {
        this.bridge.sendPetReady();
      }
    });

    ipcMain.on('ag-pet:set-ignore-mouse', (_event: any, ignore: boolean) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && typeof this.mainWindow.setIgnoreMouseEvents === 'function') {
        try {
          if (ignore) {
            this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
          } else {
            this.mainWindow.setIgnoreMouseEvents(false);
          }
        } catch (_e) {}
      }
    });

    ipcMain.on('ag-pet:focus-window', () => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          this.mainWindow.focus();
        } catch (_e) {}
      }
    });

    ipcMain.on('ag-pet:prepare-compose', () => {
      this.captureForegroundWindow();
    });

    ipcMain.on('ag-pet:send-chat-message', (_event: any, text: string) => {
      this.handleSendChatMessage(text);
    });

    ipcMain.on('pet_close', () => {
      this.terminate();
    });
  }

  public captureForegroundWindow(): void {
    if (process.platform !== 'win32') return;
    const psScript = `
$w = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);' -Name "WinUtil" -Namespace "AGPet" -PassThru -ErrorAction SilentlyContinue
$h = [AGPet.WinUtil]::GetForegroundWindow()
$p = 0
[AGPet.WinUtil]::GetWindowThreadProcessId($h, [ref]$p)
"$h,$p"
`;
    child_process.execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { windowsHide: true },
      (err, stdout) => {
        if (!err && stdout) {
          const parts = stdout.trim().split(',');
          if (parts.length === 2) {
            const hwnd = parts[0].trim();
            const pid = parseInt(parts[1].trim(), 10);
            if (pid > 0 && pid !== process.pid) {
              this.lastActiveAgPid = pid;
              this.lastActiveAgHwnd = hwnd;
              logDebug(`Captured active foreground window: PID=${pid}, HWND=${hwnd}`);
            }
          }
        }
      }
    );
  }

  public handleSendChatMessage(text: string): void {
    logDebug(`handleSendChatMessage: "${text}"`);
    if (!text || typeof text !== 'string' || !text.trim()) return;

    this.isSendingChatMessage = true;

    const clipboard = electronModule?.clipboard;
    let originalClipboard = '';
    try {
      if (clipboard) {
        originalClipboard = clipboard.readText();
        clipboard.writeText(text);
      }
    } catch (err: any) {
      logDebug(`Clipboard write error: ${err?.message || err}`);
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        if (typeof this.mainWindow.setIgnoreMouseEvents === 'function') {
          this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
        }
        if (typeof this.mainWindow.blur === 'function') {
          this.mainWindow.blur();
        }
      } catch (_e) {}
    }

    const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'send-chat-message.ps1');
    const targetHwnd = this.lastActiveAgHwnd || '0';
    const targetPid = this.lastActiveAgPid || this.parentPid || 0;
    logDebug(`Executing send-chat-message.ps1 with targetHwnd=${targetHwnd}, targetPid=${targetPid}`);

    if (process.platform === 'win32') {
      child_process.execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-TargetHwnd',
          String(targetHwnd),
          '-TargetPid',
          String(targetPid),
        ],
        { windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            logDebug(`send-chat-message.ps1 error: ${err.message}, stderr: ${stderr}`);
          } else {
            logDebug(`send-chat-message.ps1 result: ${stdout ? stdout.trim() : ''}`);
          }

          // Restore user's previous clipboard after pasting
          setTimeout(() => {
            try {
              if (clipboard && originalClipboard !== undefined) {
                clipboard.writeText(originalClipboard);
                logDebug('Restored user clipboard');
              }
            } catch (_e) {}
          }, 500);

          // Reset sending flag and re-enforce topmost after 1200ms
          setTimeout(() => {
            this.isSendingChatMessage = false;
            if (!this.isPetHidden) {
              this.enforceTopmost();
            }
          }, 1200);
        }
      );
    } else {
      this.isSendingChatMessage = false;
    }
  }

  public hidePet(): void {
    this.isPetHidden = true;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('hide_pet');
      this.mainWindow.hide();
    }
    this.updateTrayMenu();
  }

  public showPet(): void {
    this.isPetHidden = false;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.enforceTopmost();
      if (typeof this.mainWindow.setIgnoreMouseEvents === 'function') {
        try {
          this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
        } catch (_e) {}
      }
      this.mainWindow.webContents.send('show_pet');
    }
    this.updateTrayMenu();
  }

  public togglePetVisibility(): void {
    if (this.isPetHidden || (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isVisible())) {
      this.showPet();
    } else {
      this.hidePet();
    }
  }

  public resetPosition(): void {
    const screen = electronModule?.screen;
    const config = this.configManager.getConfig();
    const { width, height } = calculateWindowDimensions(config.scale);
    let defaultX = 100;
    let defaultY = 100;
    if (screen) {
      try {
        const primary = screen.getPrimaryDisplay();
        const { width: sW, height: sH } = primary.workAreaSize;
        defaultX = Math.max(50, sW - width - 40);
        defaultY = Math.max(50, sH - height - 40);
      } catch (_e) {}
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setPosition(Math.round(defaultX), Math.round(defaultY));
    }
    this.configManager.updateConfig({ x: defaultX, y: defaultY });
    this.configManager.save();
    if (this.bridge) {
      this.bridge.sendConfigUpdate({ x: defaultX, y: defaultY });
    }
    this.showPet();
  }

  public setScale(scale: PetScale): void {
    this.configManager.updateConfig({ scale });
    this.configManager.save();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const { width, height } = calculateWindowDimensions(scale);
      this.mainWindow.setSize(Math.round(width), Math.round(height));
      this.mainWindow.webContents.send('config_update', { scale });
    }
    if (this.bridge) {
      this.bridge.sendConfigUpdate({ scale });
    }
    this.updateTrayMenu();
  }

  public toggleMute(): void {
    const config = this.configManager.getConfig();
    const isMuted = !config.isMuted;
    this.configManager.updateConfig({ isMuted });
    this.configManager.save();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('config_update', { isMuted });
    }
    if (this.bridge) {
      this.bridge.sendConfigUpdate({ isMuted });
    }
    this.updateTrayMenu();
  }

  public isAutoStartEnabled(): boolean {
    if (process.platform !== 'win32') return false;
    try {
      const stdout = child_process.execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v AGPet',
        { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
      );
      return stdout.includes('AGPet');
    } catch (_e) {
      return false;
    }
  }

  public setAutoStartEnabled(enabled: boolean): void {
    if (process.platform !== 'win32') return;
    try {
      if (enabled) {
        const vbsCandidate = path.resolve(__dirname, '../../../scripts/launch-service.vbs');
        const vbsPath = fs.existsSync(vbsCandidate) ? vbsCandidate : 'd:\\Projects\\AG_Pet\\scripts\\launch-service.vbs';
        const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v AGPet /t REG_SZ /d "wscript.exe \\"${vbsPath}\\"" /f`;
        child_process.execSync(cmd, { stdio: 'ignore' });
        logDebug('Auto-start enabled in Windows registry');
      } else {
        child_process.execSync(
          'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v AGPet /f',
          { stdio: 'ignore' }
        );
        logDebug('Auto-start disabled in Windows registry');
      }
    } catch (err: any) {
      logDebug(`setAutoStartEnabled error: ${err?.message || err}`);
    }
    this.updateTrayMenu();
  }

  private initTray(): void {
    if (!Tray || !Menu || !nativeImage) {
      logDebug('initTray: Tray, Menu, or nativeImage not available');
      return;
    }

    try {
      const candidateIconPaths = [
        path.join(__dirname, '../renderer/assets/gravi_head_256.png'),
        path.join(__dirname, '../../renderer/assets/gravi_head_256.png'),
        path.join(__dirname, 'renderer/assets/gravi_head_256.png'),
        path.join(process.cwd(), 'desktop-overlay/dist/desktop-overlay/renderer/assets/gravi_head_256.png'),
        path.join(process.cwd(), 'desktop-overlay/renderer/assets/gravi_head_256.png'),
        path.join(process.cwd(), 'assets/clean/gravi_head_256.png'),
        path.join(process.cwd(), 'assets/clean/gravi_cropped_128.png'),
      ];
      const iconPath = candidateIconPaths.find((p) => fs.existsSync(p));
      if (!iconPath) {
        logDebug('initTray: No icon asset found on disk');
        return;
      }

      const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      this.tray = new Tray(trayIcon);
      this.tray.setToolTip('Грави — компаньон Antigravity (Ctrl+Shift+G)');

      this.tray.on('click', () => {
        logDebug('Tray icon clicked: calling showPet()');
        this.showPet();
      });

      this.updateTrayMenu();
      logDebug('initTray: System tray initialized successfully');
    } catch (err: any) {
      logDebug(`initTray error: ${err?.message || err}`);
    }
  }

  private updateTrayMenu(): void {
    if (!this.tray || !Menu) return;

    try {
      const config = this.configManager.getConfig();
      const isAuto = this.isAutoStartEnabled();
      const contextMenu = Menu.buildFromTemplate([
        {
          label: this.isPetHidden ? 'Показать Грави (Ctrl+Shift+G)' : 'Скрыть Грави (Ctrl+Shift+G)',
          click: () => this.togglePetVisibility(),
        },
        {
          label: 'Сбросить позицию (в угол экрана)',
          click: () => this.resetPosition(),
        },
        {
          label: 'Масштаб',
          submenu: ([1.0, 1.5, 2.0] as PetScale[]).map((s) => ({
            label: `${s.toFixed(1)}x`,
            type: 'radio' as const,
            checked: config.scale === s,
            click: () => this.setScale(s),
          })),
        },
        {
          label: config.isMuted ? 'Включить звук' : 'Выключить звук',
          click: () => this.toggleMute(),
        },
        {
          label: 'Автозапуск с Windows',
          type: 'checkbox' as const,
          checked: isAuto,
          click: (item: any) => this.setAutoStartEnabled(item.checked),
        },
        {
          type: 'separator' as const,
        },
        {
          label: 'Выход из AG Pet',
          click: () => this.terminate(),
        },
      ]);
      this.tray.setContextMenu(contextMenu);
    } catch (err: any) {
      logDebug(`updateTrayMenu error: ${err?.message || err}`);
    }
  }

  private initGlobalShortcuts(): void {
    if (!globalShortcut || typeof globalShortcut.register !== 'function') {
      return;
    }
    try {
      globalShortcut.register('CommandOrControl+Shift+G', () => {
        logDebug('Global shortcut CommandOrControl+Shift+G triggered');
        this.togglePetVisibility();
      });
      logDebug('Global shortcut CommandOrControl+Shift+G registered successfully');
    } catch (err: any) {
      logDebug(`Failed to register global shortcut: ${err?.message || err}`);
    }
  }

  public terminate(): void {
    logDebug('OverlayApplication.terminate() called!');
    if (globalShortcut && typeof globalShortcut.unregisterAll === 'function') {
      try {
        globalShortcut.unregisterAll();
      } catch (_e) {}
    }
    if (this.tray && typeof this.tray.destroy === 'function') {
      try {
        this.tray.destroy();
        this.tray = null;
      } catch (_e) {}
    }
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

  public getTray(): any {
    return this.tray;
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
