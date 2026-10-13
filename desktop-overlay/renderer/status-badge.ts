/**
 * desktop-overlay/renderer/status-badge.ts
 * Interactive hover tooltip badge displaying current agent activity and status indicator.
 */

import { AgentState } from '../../shared/types';

export const STATE_COLORS: Record<AgentState, string> = {
  idle: '#94A3B8',
  running: '#00FFFF',
  needs_input: '#FBBF24',
  ready: '#4ADE80',
  blocked: '#F87171',
  dragging: '#38BDF8',
  waving: '#E879F9',
  sleeping: '#64748B',
};

export const DEFAULT_STATE_NAMES: Record<AgentState, string> = {
  idle: 'Idle',
  running: 'Agent running...',
  needs_input: 'Awaiting user input',
  ready: 'Task completed ★',
  blocked: 'Error / Blocked',
  dragging: 'Moving pet',
  waving: 'Antigravity IDE',
  sleeping: 'Zzz... Sleeping',
};

export class StatusBadge {
  private badgeElement: HTMLElement | null = null;
  private dotElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;

  private isBadgeVisible = false;
  private currentState: AgentState = 'idle';
  private currentSummary = 'Idle';
  private maxLength = 60;

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
  }

  public onMouseEnter(): void {
    this.show();
  }

  public onMouseLeave(): void {
    this.hide();
  }

  public show(): void {
    this.isBadgeVisible = true;
    if (this.badgeElement) {
      this.badgeElement.classList.add('visible');
    }
  }

  public hide(): void {
    this.isBadgeVisible = false;
    if (this.badgeElement) {
      this.badgeElement.classList.remove('visible');
    }
  }

  public isVisible(): boolean {
    return this.isBadgeVisible;
  }

  public updateState(state: AgentState, summary?: string): void {
    this.currentState = state;
    if (summary && summary.trim().length > 0) {
      this.currentSummary = summary.trim();
    } else {
      this.currentSummary = DEFAULT_STATE_NAMES[state] || 'Idle';
    }
    this.render();
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
      this.dotElement.style.boxShadow = `0 0 6px ${color}`;
    }

    if (this.textElement) {
      this.textElement.textContent = text;
      this.textElement.title = this.currentSummary;
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
