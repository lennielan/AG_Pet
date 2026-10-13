/**
 * desktop-overlay/renderer/status-badge.ts
 * Interactive hover tooltip badge displaying current agent activity and status indicator.
 */

import { AgentState } from '../../shared/types';

export const STATE_COLORS: Record<AgentState, string> = {
  idle: '#64748B',
  thinking: '#A78BFA',
  running: '#38BDF8',
  needs_input: '#FBBF24',
  ready: '#34D399',
  blocked: '#F87171',
  dragging: '#38BDF8',
  waving: '#E879F9',
  sleeping: '#475569',
};

export const DEFAULT_STATE_NAMES: Record<AgentState, string> = {
  idle: 'idle',
  thinking: 'Thinking...',
  running: 'working...',
  needs_input: 'waiting for input',
  ready: 'task complete',
  blocked: 'error',
  dragging: 'moving',
  waving: 'hello!',
  sleeping: 'Zzz...',
};

export class StatusBadge {
  private badgeElement: HTMLElement | null = null;
  private dotElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;

  private isHovered = false;
  private isAutoPinned = false;
  private isBadgeVisible = false;
  private currentState: AgentState = 'idle';
  private currentSummary = 'idle';
  private maxLength = 60;
  private thinkingInterval: any = null;
  private thinkingSeconds = 0;

  constructor(elements?: {
    badge?: HTMLElement | null;
    dot?: HTMLElement | null;
    text?: HTMLElement | null;
  }) {
    if (elements) {
      this.badgeElement = elements.badge ?? null;
      this.dotElement = elements.dot ?? null;
      this.textElement = elements.text ?? null;
    }
  }

  public bindElements(
    badge: HTMLElement,
    dot: HTMLElement,
    text: HTMLElement
  ): void {
    this.badgeElement = badge;
    this.dotElement = dot;
    this.textElement = text;
    this.render();
    this.syncVisibility();
  }

  public onMouseEnter(): void {
    this.isHovered = true;
    this.syncVisibility();
  }

  public onMouseLeave(): void {
    this.isHovered = false;
    this.syncVisibility();
  }

  public show(): void {
    this.isHovered = true;
    this.syncVisibility();
  }

  public hide(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
    this.isHovered = false;
    this.isAutoPinned = false;
    this.syncVisibility();
  }

  public isVisible(): boolean {
    return this.isBadgeVisible;
  }

  private syncVisibility(): void {
    const shouldShow = this.isHovered || this.isAutoPinned;
    this.isBadgeVisible = shouldShow;
    if (this.badgeElement) {
      if (shouldShow) {
        this.badgeElement.classList.add('visible');
      } else {
        this.badgeElement.classList.remove('visible');
      }
    }
  }

  public updateState(state: AgentState, summary?: string): void {
    this.currentState = state;

    if (state !== 'thinking') {
      if (this.thinkingInterval) {
        clearInterval(this.thinkingInterval);
        this.thinkingInterval = null;
      }
      this.thinkingSeconds = 0;
    }

    if (state === 'thinking') {
      if (!this.thinkingInterval) {
        this.thinkingSeconds = 1;
        this.thinkingInterval = setInterval(() => {
          this.thinkingSeconds++;
          this.currentSummary = `Thinking ${this.thinkingSeconds}s...`;
          this.render();
        }, 1000);
        if (typeof this.thinkingInterval.unref === 'function') {
          this.thinkingInterval.unref();
        }
      }
      this.currentSummary = `Thinking ${this.thinkingSeconds}s...`;
    } else if (state === 'running') {
      if (summary && summary.trim().length > 0) {
        let s = summary.trim();
        s = s.replace(/^Running tool:\s*/i, 'run: ').replace(/^Running:\s*/i, 'run: ');
        this.currentSummary = s;
      } else {
        this.currentSummary = 'working...';
      }
    } else if (state === 'ready') {
      this.currentSummary = (summary && !summary.includes('Task completed') && !summary.includes('ready')) ? summary.trim() : 'task complete';
    } else if (state === 'needs_input') {
      this.currentSummary = (summary && !summary.includes('Awaiting user')) ? summary.trim() : 'waiting for input';
    } else if (state === 'blocked') {
      this.currentSummary = (summary && !summary.includes('Error / Blocked')) ? summary.trim() : 'error';
    } else {
      if (summary && summary.trim().length > 0) {
        this.currentSummary = summary.trim();
      } else {
        this.currentSummary = DEFAULT_STATE_NAMES[state] || 'idle';
      }
    }

    // Auto-pin badge during active execution and thinking states
    if (state === 'thinking' || state === 'running' || state === 'needs_input' || state === 'blocked' || state === 'ready') {
      this.isAutoPinned = true;
    } else {
      this.isAutoPinned = false;
    }

    this.render();
    this.syncVisibility();
  }

  public getStateColor(): string {
    return STATE_COLORS[this.currentState] || '#FFFFFF';
  }

  public getRenderedText(maxLength = this.maxLength): string {
    if (this.currentSummary.length <= maxLength) {
      return this.currentSummary;
    }
    return this.currentSummary.slice(0, Math.max(0, maxLength - 3)) + '...';
  }

  private render(): void {
    const color = this.getStateColor();
    const text = this.getRenderedText();

    if (this.dotElement) {
      this.dotElement.style.backgroundColor = color;
      this.dotElement.classList.toggle('thinking', this.currentState === 'thinking');
      this.dotElement.classList.toggle('pulsing', this.currentState === 'running');
    }

    if (this.textElement) {
      this.textElement.textContent = text;
    }
  }
}

/**
 * Factory helper for headless contract validation and unit testing.
 */
export function createTooltipBadge(
  initialSummary = 'Idle',
  initialState: AgentState = 'idle'
): StatusBadge {
  const badge = new StatusBadge();
  badge.updateState(initialState, initialSummary);
  return badge;
}
