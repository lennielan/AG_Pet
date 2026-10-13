/**
 * desktop-overlay/renderer/drag-controller.ts
 * Cross-monitor mouse drag controller with screen coordinate translation and persistence.
 */

import { PetConfig } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/constants';

export interface DragControllerCallbacks {
  onDragStart?: () => void;
  onDragMove?: (newX: number, newY: number, vx: number, vy: number) => void;
  onDragEnd?: (finalX: number, finalY: number) => void;
  onClick?: (event: MouseEvent | PointerEvent) => void;
  onPersist?: (config: PetConfig) => void;
}

export class DragController {
  private config: PetConfig;
  private isDraggingActive = false;
  private hasExceededDragThreshold = false;
  private dragStartInfo: {
    screenX: number;
    screenY: number;
    initialX: number;
    initialY: number;
    startTime: number;
  } | null = null;

  private lastMovePos: { screenX: number; screenY: number; time: number } | null = null;
  private velocity: { vx: number; vy: number } = { vx: 0, vy: 0 };
  private callbacks: DragControllerCallbacks;

  private boundPointerDown = this.handlePointerDown.bind(this);
  private boundPointerMove = this.handlePointerMove.bind(this);
  private boundPointerUp = this.handlePointerUp.bind(this);

  constructor(
    initialConfig: Partial<PetConfig> = {},
    callbacks: DragControllerCallbacks = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...initialConfig,
    };
    this.callbacks = callbacks;
  }

  public bindElement(element: HTMLElement): void {
    element.addEventListener('pointerdown', this.boundPointerDown);
    // Listen on window to avoid losing pointer events during rapid drag
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    window.addEventListener('pointercancel', this.boundPointerUp);
  }

  public unbind(element: HTMLElement): void {
    element.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointercancel', this.boundPointerUp);
  }

  public getConfig(): Readonly<PetConfig> {
    return { ...this.config };
  }

  public isDragging(): boolean {
    return this.hasExceededDragThreshold;
  }

  public getVelocity(): { vx: number; vy: number } {
    return { ...this.velocity };
  }

  /**
   * Programmatic drag start for unit tests and headless harnesses.
   */
  public startDrag(screenX: number, screenY: number): void {
    this.isDraggingActive = true;
    this.hasExceededDragThreshold = false;
    this.dragStartInfo = {
      screenX,
      screenY,
      initialX: this.config.x,
      initialY: this.config.y,
      startTime: performance.now(),
    };
    this.lastMovePos = { screenX, screenY, time: performance.now() };
    this.velocity = { vx: 0, vy: 0 };
  }

  /**
   * Programmatic drag move handler.
   */
  public dragMove(screenX: number, screenY: number): void {
    if (!this.isDraggingActive || !this.dragStartInfo) {
      return;
    }

    const deltaX = screenX - this.dragStartInfo.screenX;
    const deltaY = screenY - this.dragStartInfo.screenY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > 5) {
      if (!this.hasExceededDragThreshold) {
        this.hasExceededDragThreshold = true;
        if (this.callbacks.onDragStart) {
          this.callbacks.onDragStart();
        }
      }
    }

    // Calculate instantaneous velocity for directional lean animation
    const now = performance.now();
    if (this.lastMovePos) {
      const rawDt = (now - this.lastMovePos.time) / 1000;
      const dt = rawDt > 0.001 ? rawDt : 0.016;
      const dx = screenX - this.lastMovePos.screenX;
      const dy = screenY - this.lastMovePos.screenY;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        this.velocity = { vx: 0, vy: 0 };
      } else {
        this.velocity = {
          vx: Math.max(-800, Math.min(800, dx / dt)),
          vy: Math.max(-800, Math.min(800, dy / dt)),
        };
      }
    }
    this.lastMovePos = { screenX, screenY, time: now };

    // Update coordinates (supports negative coordinates across virtual screens)
    this.config.x = this.dragStartInfo.initialX + deltaX;
    this.config.y = this.dragStartInfo.initialY + deltaY;

    if (this.hasExceededDragThreshold && this.callbacks.onDragMove) {
      this.callbacks.onDragMove(this.config.x, this.config.y, this.velocity.vx, this.velocity.vy);
    }
  }

  /**
   * Programmatic drag end handler.
   */
  public endDrag(savePath?: string): PetConfig {
    const wasDragging = this.hasExceededDragThreshold;
    this.isDraggingActive = false;
    this.hasExceededDragThreshold = false;
    this.dragStartInfo = null;
    this.lastMovePos = null;
    this.velocity = { vx: 0, vy: 0 };

    if (wasDragging && this.callbacks.onDragEnd) {
      this.callbacks.onDragEnd(this.config.x, this.config.y);
    }

    if (this.callbacks.onPersist) {
      this.callbacks.onPersist({ ...this.config });
    }

    if (savePath) {
      try {
        const fs = require('node:fs');
        fs.writeFileSync(savePath, JSON.stringify(this.config, null, 2), 'utf8');
      } catch (_e) {}
    }

    return { ...this.config };
  }

  public loadConfig(filePath: string): PetConfig {
    try {
      const fs = require('node:fs');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (typeof data.x === 'number') this.config.x = data.x;
        if (typeof data.y === 'number') this.config.y = data.y;
        if (typeof data.scale === 'number') this.config.scale = data.scale;
        if (typeof data.isMuted === 'boolean') this.config.isMuted = data.isMuted;
      }
    } catch (_e) {}
    return { ...this.config };
  }

  // --- Browser DOM Event Handlers ---

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return; // Only track primary left click
    this.startDrag(e.screenX, e.screenY);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isDraggingActive) return;
    this.dragMove(e.screenX, e.screenY);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.isDraggingActive) return;

    const wasDrag = this.hasExceededDragThreshold;
    this.endDrag();

    if (!wasDrag) {
      if (this.callbacks.onDragEnd) {
        this.callbacks.onDragEnd(this.config.x, this.config.y);
      }
      if (this.callbacks.onClick) {
        this.callbacks.onClick(e);
      }
    }
  }
}

/**
 * Factory helper matching F06 test model contract.
 */
export function createDragPersistModel(
  initialConfig: PetConfig = { x: 100, y: 100, scale: 1.0, isMuted: false }
): DragController {
  return new DragController(initialConfig);
}
