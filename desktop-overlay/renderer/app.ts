/**
 * desktop-overlay/renderer/app.ts
 * Main renderer application orchestrating the PetEngine, drag handling,
 * context menu, activity status badge, headpat interaction, break reminders, and IPC.
 */

import { PetEngine } from '../../sprite-engine';
import { AgentState, PetConfig, PetScale, StatePayload } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/constants';
import { StatusBadge } from './status-badge';
import { ContextMenuController } from './context-menu';
import { DragController } from './drag-controller';

let electronModule: any = null;
try {
  electronModule = require('electron');
} catch (_e) {
  // Graceful fallback for non-electron execution
}

const ipcRenderer = electronModule?.ipcRenderer;

/**
 * Click handler with debouncing and drag-separation logic matching F09 contracts.
 */
export function createPetClickHandler(options: {
  onFocus?: (msg: { type: 'focus_ide' }) => void;
  onWave?: () => void;
  debounceMs?: number;
}) {
  const debounceMs = options.debounceMs ?? 250;
  let lastClickTime = 0;
  let focusCount = 0;
  let waveCount = 0;

  const handlePointerDown = (x: number, y: number) => ({
    startX: x,
    startY: y,
    time: Date.now(),
  });

  const handlePointerUp = (
    start: { startX: number; startY: number; time: number },
    endX: number,
    endY: number
  ) => {
    const dist = Math.hypot(endX - start.startX, endY - start.startY);
    if (dist > 5) {
      return { isClick: false, dist };
    }

    const now = Date.now();
    waveCount++;
    if (options.onWave) {
      options.onWave();
    }

    if (now - lastClickTime >= debounceMs) {
      lastClickTime = now;
      focusCount++;
      if (options.onFocus) {
        options.onFocus({ type: 'focus_ide' });
      }
      return { isClick: true, focused: true };
    }

    return { isClick: true, focused: false, debounced: true };
  };

  return {
    handlePointerDown,
    handlePointerUp,
    getFocusCount: () => focusCount,
    getWaveCount: () => waveCount,
  };
}

export class PetOverlayRendererApp {
  private canvas: HTMLCanvasElement;
  private petEngine: PetEngine;
  private statusBadge: StatusBadge;
  private contextMenu: ContextMenuController;
  private dragController: DragController;
  private config: PetConfig;
  private clickHandler: ReturnType<typeof createPetClickHandler>;
  private isIgnoringMouse = true;
  private sleepTimer: any = null;
  private lastMoveCheckTime = 0;
  private lastPersistentSummary = 'В ожидании';

  // Headpat gesture tracking
  private headpatSamples: Array<{ x: number; y: number; time: number }> = [];
  private lastHeadpatTriggerTime = 0;

  // 30-minute break reminder
  private breakTimer: any = null;
  private pendingBreakReminder = false;

  constructor(canvas: HTMLCanvasElement, initialConfig: Partial<PetConfig> = {}) {
    this.canvas = canvas;
    this.config = {
      ...DEFAULT_CONFIG,
      ...initialConfig,
    };

    // Initialize UI Components first
    this.statusBadge = new StatusBadge();
    this.contextMenu = new ContextMenuController(this.config, {
      onScaleChange: (scale) => this.handleScaleChange(scale),
      onToggleMute: (isMuted) => this.handleMuteToggle(isMuted),
      onHide: () => this.handleHide(),
      onPersist: (cfg) => this.persistConfig(cfg),
      onTestState: (state) => this.handleTestState(state),
      onClose: () => {
        this.setIgnoreMouse(true);
      },
    });

    // Initialize PetEngine with synchronized state change listener
    this.petEngine = new PetEngine(this.canvas, {
      scale: this.config.scale,
      muted: this.config.isMuted,
      volume: 0.3,
      onStateChange: (state) => {
        this.statusBadge.updateState(state, this.lastPersistentSummary);
        this.contextMenu.setActiveState(state);
      },
    });

    // Wire Click & Focus logic
    this.clickHandler = createPetClickHandler({
      onFocus: () => {
        if (ipcRenderer) {
          ipcRenderer.send('focus_ide');
        }
      },
      onWave: () => {
        this.resetSleepTimer();
        this.petEngine.onClick();
      },
      debounceMs: 250,
    });

    // Wire Drag Controller
    this.dragController = new DragController(this.config, {
      onDragStart: () => {
        this.setIgnoreMouse(false);
        this.resetSleepTimer();
        this.petEngine.onDragStart();
        const dragRegion = document.getElementById('drag-region');
        if (dragRegion) dragRegion.classList.add('dragging');
        if (ipcRenderer) {
          ipcRenderer.send('start_drag');
        }
      },
      onDragMove: (newX, newY, vx, vy) => {
        this.petEngine.setDragVelocity(vx, vy);
        if (ipcRenderer) {
          ipcRenderer.send('drag_move', newX, newY);
        }
      },
      onDragEnd: (finalX, finalY) => {
        this.petEngine.onDragEnd();
        const dragRegion = document.getElementById('drag-region');
        if (dragRegion) dragRegion.classList.remove('dragging');
        if (ipcRenderer) {
          ipcRenderer.send('end_drag', finalX, finalY);
        }
        this.persistConfig({ x: finalX, y: finalY });
      },
      onClick: () => {
        this.resetSleepTimer();
        this.petEngine.onClick();
        if (ipcRenderer) {
          ipcRenderer.send('focus_ide');
        }
      },
      onPersist: (cfg) => this.persistConfig(cfg),
    });
  }

  public initDom(): void {
    const badgeEl = document.getElementById('status-badge');
    const dotEl = document.getElementById('status-dot');
    const textEl = document.getElementById('status-text');
    const iconEl = document.getElementById('status-icon') as HTMLCanvasElement | null;
    if (badgeEl && dotEl && textEl) {
      this.statusBadge.bindElements(badgeEl, dotEl, textEl, iconEl);
    }

    const menuEl = document.getElementById('context-menu');
    if (menuEl) {
      this.contextMenu.bindElement(menuEl);
    }

    const dragRegion = document.getElementById('drag-region');
    if (dragRegion) {
      this.dragController.bindElement(dragRegion);

      // Context Menu Trigger
      dragRegion.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.setIgnoreMouse(false);
        this.resetSleepTimer();
        this.contextMenu.show(e.clientX, e.clientY, this.dragController.isDragging());
      });
    }

    this.setupClickThroughListener();
    this.resetSleepTimer();
    this.setupIpcListeners();
  }

  public setIgnoreMouse(ignore: boolean): void {
    if (this.isIgnoringMouse === ignore) return;
    this.isIgnoringMouse = ignore;
    if (ipcRenderer) {
      ipcRenderer.send('ag-pet:set-ignore-mouse', ignore);
    }
  }

  public resetSleepTimer(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }

    // Wake up if currently in sleeping state
    if (this.petEngine.getState() === 'sleeping') {
      this.updateState({
        state: 'idle',
        summary: 'В ожидании',
        timestamp: Date.now(),
      });
    }

    // 180 seconds idle timeout to sleep
    this.sleepTimer = setTimeout(() => {
      if (this.petEngine.getState() === 'idle') {
        this.updateState({
          state: 'sleeping',
          summary: 'Спит... Zzz',
          timestamp: Date.now(),
        });
      }
    }, 180000);
  }

  private setupClickThroughListener(): void {
    window.addEventListener('mousemove', (e: MouseEvent) => {
      const now = performance.now();
      if (now - this.lastMoveCheckTime < 16) return;
      this.lastMoveCheckTime = now;

      // If context menu is open, check whether cursor is within menu bounds
      if (this.contextMenu.isVisible()) {
        const menuEl = document.getElementById('context-menu');
        if (menuEl) {
          const mRect = menuEl.getBoundingClientRect();
          if (
            e.clientX >= mRect.left &&
            e.clientX <= mRect.right &&
            e.clientY >= mRect.top &&
            e.clientY <= mRect.bottom
          ) {
            this.setIgnoreMouse(false);
            this.resetSleepTimer();
            return;
          }
        }
      }

      // If pet is actively dragging, never ignore mouse
      if (this.dragController.isDragging()) {
        this.setIgnoreMouse(false);
        this.resetSleepTimer();
        return;
      }

      // Check canvas bounding box
      const cRect = this.canvas.getBoundingClientRect();
      if (
        e.clientX < cRect.left ||
        e.clientX > cRect.right ||
        e.clientY < cRect.top ||
        e.clientY > cRect.bottom
      ) {
        this.setIgnoreMouse(true);
        this.statusBadge.onMouseLeave();
        return;
      }

      // Inside canvas bounding box: pixel-perfect alpha sampling with 5px radius tolerance
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
      if (!ctx) {
        this.setIgnoreMouse(false);
        return;
      }

      const localX = Math.round(((e.clientX - cRect.left) / cRect.width) * this.canvas.width);
      const localY = Math.round(((e.clientY - cRect.top) / cRect.height) * this.canvas.height);

      const sampleSize = 5;
      const startX = Math.max(0, localX - Math.floor(sampleSize / 2));
      const startY = Math.max(0, localY - Math.floor(sampleSize / 2));
      const w = Math.min(sampleSize, this.canvas.width - startX);
      const h = Math.min(sampleSize, this.canvas.height - startY);

      if (w <= 0 || h <= 0) {
        this.setIgnoreMouse(true);
        this.statusBadge.onMouseLeave();
        return;
      }

      try {
        const imgData = ctx.getImageData(startX, startY, w, h);
        let hasOpaquePixel = false;
        for (let i = 3; i < imgData.data.length; i += 4) {
          if (imgData.data[i] > 25) {
            hasOpaquePixel = true;
            break;
          }
        }

        if (hasOpaquePixel) {
          this.setIgnoreMouse(false);
          this.statusBadge.onMouseEnter();
          this.resetSleepTimer();

          // Check if cursor is over Gravi's head region for petting
          const fractionX = localX / this.canvas.width;
          const fractionY = localY / this.canvas.height;
          if (fractionY >= 0.05 && fractionY <= 0.45 && fractionX >= 0.20 && fractionX <= 0.80) {
            this.trackHeadpatMovement(e.clientX, e.clientY);
          }
        } else {
          this.setIgnoreMouse(true);
          this.statusBadge.onMouseLeave();
        }
      } catch (_e) {
        this.setIgnoreMouse(false);
      }
    });

    window.addEventListener('mouseleave', () => {
      if (!this.contextMenu.isVisible() && !this.dragController.isDragging()) {
        this.setIgnoreMouse(true);
        this.statusBadge.onMouseLeave();
      }
    });
  }

  private trackHeadpatMovement(cx: number, cy: number): void {
    const now = Date.now();
    this.headpatSamples.push({ x: cx, y: cy, time: now });

    // Prune samples older than 900ms
    this.headpatSamples = this.headpatSamples.filter((s) => now - s.time <= 900);

    if (this.headpatSamples.length >= 4 && now - this.lastHeadpatTriggerTime >= 5000) {
      let totalDistX = 0;
      let reversals = 0;
      let lastDir = 0;

      for (let i = 1; i < this.headpatSamples.length; i++) {
        const dx = this.headpatSamples[i].x - this.headpatSamples[i - 1].x;
        totalDistX += Math.abs(dx);
        if (Math.abs(dx) >= 3) {
          const dir = Math.sign(dx);
          if (lastDir !== 0 && dir !== lastDir) {
            reversals++;
          }
          lastDir = dir;
        }
      }

      if (totalDistX >= 130 && reversals >= 2) {
        this.triggerHeadpat();
        this.lastHeadpatTriggerTime = now;
        this.headpatSamples = [];
      }
    }
  }

  public triggerHeadpat(): void {
    this.resetSleepTimer();
    this.petEngine.triggerHeadpat(2.0);
    const audio = this.petEngine.getAudio();
    if (audio) {
      audio.playPreset('headpat');
    }
    const phrases = [
      'Мур-р-р! Спасибо! ♥',
      'Приятно! Погнали кодить дальше! ♥',
      'Грави заряжен на 100%! ♥',
      '*довольное мурчание* ♥',
      'Ты лучший разработчик! ♥',
      'Обожаю поглаживания! ♥',
    ];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    this.statusBadge.showTemporary(phrase, 'heart', 3000);
  }

  public start(): void {
    this.petEngine.start();
    this.initBreakReminder();
    this.initStartupGreeting();
    if (ipcRenderer) {
      ipcRenderer.send('pet_ready');
    }
  }

  private initBreakReminder(): void {
    if (this.breakTimer) {
      clearInterval(this.breakTimer);
    }
    // 30 minutes interval
    this.breakTimer = setInterval(() => {
      this.checkBreakReminder();
    }, 30 * 60 * 1000);
    if (typeof this.breakTimer?.unref === 'function') {
      this.breakTimer.unref();
    }
  }

  public checkBreakReminder(): void {
    const currentState = this.petEngine.getState();
    if (currentState === 'idle' || currentState === 'sleeping') {
      this.triggerBreakReminder();
    } else {
      this.pendingBreakReminder = true;
    }
  }

  public triggerBreakReminder(): void {
    this.pendingBreakReminder = false;
    this.resetSleepTimer();
    this.petEngine.onClick();
    const audio = this.petEngine.getAudio();
    if (audio) {
      audio.playPreset('ready');
    }
    const breakPhrases = [
      'Пора размяться и выпить воды! ☕',
      '30 минут прошло! Сделай паузу и потянись! 🧘',
      'Глазам нужен отдых! Посмотри в окно 1 минуту 🌿',
      'Время для чая или кофе! Ты отлично трудишься! ☕',
    ];
    const phrase = breakPhrases[Math.floor(Math.random() * breakPhrases.length)];
    this.statusBadge.showTemporary(phrase, 'coffee', 8000);
  }

  private initStartupGreeting(): void {
    setTimeout(() => {
      this.triggerGreeting();
    }, 600);
  }

  public triggerGreeting(): void {
    const hour = new Date().getHours();
    let greetings: string[];
    if (hour >= 5 && hour < 12) {
      greetings = [
        'Доброе утро! Готов к новым задачам! ✨',
        'Утренний кофе и чистый код! ☕',
        'Привет! Начнем этот день продуктивно! 🚀',
      ];
    } else if (hour >= 12 && hour < 18) {
      greetings = [
        'Добрый день! Погнали кодить! 💻',
        'Грави на связи! Чем займемся? ⚡',
        'Привет! Готов разносить баги в пух и прах! 🔥',
      ];
    } else if (hour >= 18 && hour < 23) {
      greetings = [
        'Добрый вечер! Завершим все начатое! 🌟',
        'Грави готов к вечернему код-сеансу! 🌙',
        'Привет! Время закрывать задачи и коммитить! 🎯',
      ];
    } else {
      greetings = [
        'Доброй ночи! Ночные коммиты — самые душевные! 🌌',
        'Не спится? Грави поможет дописать проект! 🌠',
        'Привет, полуночник! Тихо пишем код... 🕯️',
      ];
    }
    const phrase = greetings[Math.floor(Math.random() * greetings.length)];
    this.petEngine.onClick();
    this.statusBadge.showTemporary(phrase, 'star', 4500);
  }

  public stop(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    if (this.breakTimer) {
      clearInterval(this.breakTimer);
      this.breakTimer = null;
    }
    this.petEngine.stop();
  }

  private handleScaleChange(scale: PetScale): void {
    this.config.scale = scale;
    this.petEngine.setScale(scale);
    if (ipcRenderer) {
      ipcRenderer.send('set_scale', scale);
    }
  }

  private handleMuteToggle(isMuted: boolean): void {
    this.config.isMuted = isMuted;
    this.petEngine.setMuted(isMuted);
    if (ipcRenderer) {
      ipcRenderer.send('set_muted', isMuted);
    }
  }

  private handleHide(): void {
    const container = document.getElementById('pet-container');
    if (container) {
      container.style.display = 'none';
    }
    if (ipcRenderer) {
      ipcRenderer.send('hide_pet');
    }
  }

  private handleTestState(state: AgentState): void {
    const russianStateNames: Record<AgentState, string> = {
      idle: 'Тест: Покой',
      thinking: 'Тест: Размышление',
      running: 'Тест: В работе',
      ready: 'Тест: Готово',
      needs_input: 'Тест: Ожидание ввода',
      blocked: 'Тест: Ошибка',
      dragging: 'Тест: Перемещение',
      waving: 'Тест: Приветствие',
      sleeping: 'Тест: Сон',
    };
    this.updateState({
      state,
      summary: russianStateNames[state] || `Тест: ${state}`,
      timestamp: Date.now(),
    });
  }

  private persistConfig(partial: Partial<PetConfig>): void {
    this.config = { ...this.config, ...partial };
    if (ipcRenderer) {
      ipcRenderer.send('save_config', partial);
    }
  }

  private setupIpcListeners(): void {
    if (!ipcRenderer) return;

    ipcRenderer.on('state_update', (_event: any, payload: StatePayload) => {
      this.updateState(payload);
    });

    ipcRenderer.on('show_pet', () => {
      const container = document.getElementById('pet-container');
      if (container) {
        container.style.display = 'flex';
      }
      this.contextMenu.showPet();
      this.setIgnoreMouse(true);
      this.resetSleepTimer();
      this.petEngine.onClick();
    });

    ipcRenderer.on('hide_pet', () => {
      const container = document.getElementById('pet-container');
      if (container) {
        container.style.display = 'none';
      }
      this.contextMenu.hide();
    });

    ipcRenderer.on('close_context_menu', () => {
      this.contextMenu.hide();
      this.setIgnoreMouse(true);
    });

    ipcRenderer.on('config_update', (_event: any, updates: Partial<PetConfig>) => {
      this.config = { ...this.config, ...updates };
      if (updates.scale) {
        this.petEngine.setScale(updates.scale);
      }
      if (typeof updates.isMuted === 'boolean') {
        this.petEngine.setMuted(updates.isMuted);
      }
      this.contextMenu.updateConfig(this.config);
    });
  }

  public updateState(payload: StatePayload): void {
    if (payload.state !== 'dragging' && payload.state !== 'waving') {
      this.lastPersistentSummary = payload.summary;
    }
    this.petEngine.setState(payload.state, true);
    this.statusBadge.updateState(payload.state, payload.summary);
    this.contextMenu.setActiveState(payload.state);
    if (payload.state !== 'sleeping') {
      this.resetSleepTimer();
    }
    if (payload.state === 'idle' && this.pendingBreakReminder) {
      this.triggerBreakReminder();
    }
  }

  public getPetEngine(): PetEngine {
    return this.petEngine;
  }

  public getStatusBadge(): StatusBadge {
    return this.statusBadge;
  }

  public getContextMenu(): ContextMenuController {
    return this.contextMenu;
  }

  public getDragController(): DragController {
    return this.dragController;
  }

  public getClickHandler(): ReturnType<typeof createPetClickHandler> {
    return this.clickHandler;
  }
}

function initPetApp(): void {
  console.log('[AG_PET_RENDERER] initPetApp starting...');
  const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('[AG_PET_RENDERER] Canvas #pet-canvas not found!');
    return;
  }

  (async () => {
    let initialConfig: Partial<PetConfig> = {};
    if (ipcRenderer) {
      try {
        initialConfig = await ipcRenderer.invoke('get_config');
        console.log('[AG_PET_RENDERER] Loaded initialConfig:', JSON.stringify(initialConfig));
      } catch (err: any) {
        console.warn('[AG_PET_RENDERER] Failed to get_config:', err);
      }
    }

    const app = new PetOverlayRendererApp(canvas, initialConfig);
    app.initDom();
    app.start();
    console.log('[AG_PET_RENDERER] PetOverlayRendererApp started successfully!');

    (window as any).__AG_PET_APP__ = app;
  })().catch((err: any) => {
    console.error('[AG_PET_RENDERER] Async init failed:', err);
  });
}

// Auto-bootstrap in browser document environment
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initPetApp);
  } else {
    initPetApp();
  }
}
