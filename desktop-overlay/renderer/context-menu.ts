/**
 * desktop-overlay/renderer/context-menu.ts
 * Retro pixel-art right-click context menu controller for AG Pet.
 */

import { AgentState, PetConfig, PetScale } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/constants';

let electronModule: any = null;
try {
  electronModule = require('electron');
} catch (_e) {}
const ipcRenderer = electronModule?.ipcRenderer;

export interface ContextMenuItem {
  id: string;
  label: string;
  checked?: boolean;
  submenu?: Array<{
    label: string;
    checked: boolean;
    action: () => void;
  }>;
  action?: () => void;
}

export interface ContextMenuCallbacks {
  onScaleChange?: (scale: PetScale) => void;
  onToggleMute?: (isMuted: boolean) => void;
  onHide?: () => void;
  onPersist?: (config: PetConfig) => void;
  onTestState?: (state: AgentState) => void;
  onClose?: () => void;
}

export class ContextMenuController {
  private config: PetConfig;
  private isPetHidden = false;
  private isMenuOpen = false;
  private currentState: AgentState = 'idle';
  private menuElement: HTMLElement | null = null;
  private callbacks: ContextMenuCallbacks;

  constructor(
    initialConfig: Partial<PetConfig> = {},
    callbacks: ContextMenuCallbacks = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...initialConfig,
    };
    this.callbacks = callbacks;
  }

  public bindElement(menuElement: HTMLElement): void {
    this.menuElement = menuElement;
    this.setupDomEvents();
    this.renderDom();
  }

  public getConfig(): Readonly<PetConfig> {
    return { ...this.config };
  }

  public isHidden(): boolean {
    return this.isPetHidden;
  }

  public isVisible(): boolean {
    return this.isMenuOpen;
  }

  public setScale(scale: PetScale): void {
    if (scale !== 1.0 && scale !== 1.5 && scale !== 2.0) return;
    this.config.scale = scale;
    if (this.callbacks.onScaleChange) {
      this.callbacks.onScaleChange(scale);
    }
    if (this.callbacks.onPersist) {
      this.callbacks.onPersist({ ...this.config });
    }
    this.renderDom();
  }

  public toggleMute(): boolean {
    this.config.isMuted = !this.config.isMuted;
    if (this.callbacks.onToggleMute) {
      this.callbacks.onToggleMute(this.config.isMuted);
    }
    if (this.callbacks.onPersist) {
      this.callbacks.onPersist({ ...this.config });
    }
    this.renderDom();
    return this.config.isMuted;
  }

  public hidePet(): void {
    this.isPetHidden = true;
    this.hide();
    if (this.callbacks.onHide) {
      this.callbacks.onHide();
    }
  }

  public showPet(): void {
    this.isPetHidden = false;
  }

  public testState(state: AgentState): void {
    this.currentState = state;
    this.renderDom();
    if (this.callbacks.onTestState) {
      this.callbacks.onTestState(state);
    }
  }

  public setActiveState(state: AgentState): void {
    this.currentState = state;
    this.renderDom();
  }

  public updateConfig(updates: Partial<PetConfig>): void {
    this.config = { ...this.config, ...updates };
    this.renderDom();
  }

  /**
   * Returns programmatic menu structure matching test harness contract.
   */
  public getMenuItems(): ContextMenuItem[] {
    return [
      {
        id: 'scale',
        label: 'Scale',
        submenu: [
          {
            label: '1.0x',
            checked: this.config.scale === 1.0,
            action: () => this.setScale(1.0),
          },
          {
            label: '1.5x',
            checked: this.config.scale === 1.5,
            action: () => this.setScale(1.5),
          },
          {
            label: '2.0x',
            checked: this.config.scale === 2.0,
            action: () => this.setScale(2.0),
          },
        ],
      },
      {
        id: 'test_state',
        label: 'Test State',
        submenu: [
          {
            label: 'Idle',
            checked: false,
            action: () => this.testState('idle'),
          },
          {
            label: 'Thinking',
            checked: false,
            action: () => this.testState('thinking'),
          },
          {
            label: 'Running',
            checked: false,
            action: () => this.testState('running'),
          },
          {
            label: 'Ready',
            checked: false,
            action: () => this.testState('ready'),
          },
          {
            label: 'Needs Input',
            checked: false,
            action: () => this.testState('needs_input'),
          },
          {
            label: 'Blocked',
            checked: false,
            action: () => this.testState('blocked'),
          },
          {
            label: 'Waving',
            checked: false,
            action: () => this.testState('waving'),
          },
          {
            label: 'Sleeping',
            checked: false,
            action: () => this.testState('sleeping'),
          },
        ],
      },
      {
        id: 'mute',
        label: this.config.isMuted ? 'Unmute Audio' : 'Mute Audio',
        action: () => this.toggleMute(),
      },
      {
        id: 'hide',
        label: 'Hide AG Pet',
        action: () => this.hidePet(),
      },
    ];
  }

  /**
   * Displays context menu at the specified client coordinates.
   */
  public show(clientX: number, clientY: number, isDragging = false): void {
    if (isDragging) {
      // Suppress context menu while actively dragging
      return;
    }

    this.isMenuOpen = true;
    if (ipcRenderer) {
      try {
        ipcRenderer.send('ag-pet:focus-window');
      } catch (_e) {}
    }
    if (this.menuElement) {
      this.renderDom();
      this.menuElement.classList.remove('hidden');

      // Reset coordinates prior to bounding box measurement to avoid edge clamping skew
      this.menuElement.style.left = '0px';
      this.menuElement.style.top = '0px';

      // Clamping to viewport bounds with 8px margin, offset from pet's face
      const rect = this.menuElement.getBoundingClientRect();
      const padding = 8;
      let targetX = clientX + 16;
      let targetY = clientY - 10;
      if (targetX + rect.width > window.innerWidth - padding) {
        targetX = Math.max(padding, clientX - rect.width - 16);
      }
      if (targetY + rect.height > window.innerHeight - padding) {
        targetY = Math.max(padding, window.innerHeight - rect.height - padding);
      }
      const posX = Math.max(padding, Math.min(targetX, window.innerWidth - rect.width - padding));
      const posY = Math.max(padding, Math.min(targetY, window.innerHeight - rect.height - padding));

      this.menuElement.style.left = `${posX}px`;
      this.menuElement.style.top = `${posY}px`;
    }
  }

  public hide(): void {
    if (!this.isMenuOpen) return;
    this.isMenuOpen = false;
    if (this.menuElement) {
      this.menuElement.classList.add('hidden');
      this.menuElement.querySelectorAll('.menu-parent').forEach((el) => {
        el.classList.remove('open');
      });
    }
    if (this.callbacks.onClose) {
      this.callbacks.onClose();
    }
  }

  private setupDomEvents(): void {
    if (!this.menuElement) return;

    // Scale options click
    const scaleOpts = this.menuElement.querySelectorAll('#scale-submenu .submenu-item');
    scaleOpts.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const scaleVal = parseFloat(el.getAttribute('data-scale') || '1.0');
        if (scaleVal === 1.0 || scaleVal === 1.5 || scaleVal === 2.0) {
          this.setScale(scaleVal as PetScale);
        }
        this.hide();
      });
    });

    // Test state options click (keeps menu open so user can cycle states!)
    const testStateOpts = this.menuElement.querySelectorAll('#test-state-submenu .submenu-item');
    testStateOpts.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const stateVal = el.getAttribute('data-state');
        if (stateVal) {
          this.testState(stateVal as AgentState);
        }
      });
    });

    // Mute toggle click
    const muteBtn = this.menuElement.querySelector('#menu-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMute();
        this.hide();
      });
    }

    // Hide pet click
    const hideBtn = this.menuElement.querySelector('#menu-hide');
    if (hideBtn) {
      hideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hidePet();
      });
    }

    // Dismiss menu on blur, pointerdown outside, click, or Escape
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => {
        if (this.isMenuOpen) this.hide();
      });

      window.addEventListener('pointerdown', (e: MouseEvent) => {
        if (this.isMenuOpen && this.menuElement && !this.menuElement.contains(e.target as Node)) {
          this.hide();
        }
      });

      window.addEventListener('click', (e: MouseEvent) => {
        if (this.isMenuOpen && this.menuElement && !this.menuElement.contains(e.target as Node)) {
          this.hide();
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isMenuOpen) {
          this.hide();
        }
      });
    }
  }

  private renderDom(): void {
    if (!this.menuElement) return;

    // Update checkmarks and active state for scale segmented pills
    const check10 = this.menuElement.querySelector('#check-10');
    const check15 = this.menuElement.querySelector('#check-15');
    const check20 = this.menuElement.querySelector('#check-20');

    if (check10) check10.textContent = this.config.scale === 1.0 ? '✔' : '';
    if (check15) check15.textContent = this.config.scale === 1.5 ? '✔' : '';
    if (check20) check20.textContent = this.config.scale === 2.0 ? '✔' : '';

    const btn10 = this.menuElement.querySelector('#scale-opt-10');
    const btn15 = this.menuElement.querySelector('#scale-opt-15');
    const btn20 = this.menuElement.querySelector('#scale-opt-20');

    btn10?.classList.toggle('active', this.config.scale === 1.0);
    btn15?.classList.toggle('active', this.config.scale === 1.5);
    btn20?.classList.toggle('active', this.config.scale === 2.0);

    // Update active highlight for test state chips
    const stateChips = this.menuElement.querySelectorAll('#test-state-submenu .submenu-item');
    stateChips.forEach((chip) => {
      const s = chip.getAttribute('data-state');
      chip.classList.toggle('active', s === this.currentState);
    });

    // Update mute label & icon
    const muteLabel = this.menuElement.querySelector('#mute-label');
    if (muteLabel) {
      muteLabel.textContent = this.config.isMuted ? 'Sound: OFF' : 'Sound: ON';
    }
    const muteIcon = this.menuElement.querySelector('#mute-icon');
    if (muteIcon) {
      muteIcon.textContent = this.config.isMuted ? '🔇' : '🔊';
    }
  }
}

/**
 * Factory helper matching F07 test suite signature.
 */
export function createContextMenuController(
  initialConfig: PetConfig,
  onPersist?: (config: PetConfig) => void
): ContextMenuController {
  return new ContextMenuController(initialConfig, { onPersist });
}
