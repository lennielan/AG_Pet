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
  idle: 'В ожидании',
  thinking: 'Думаю...',
  running: 'В работе...',
  needs_input: 'Жду твоего ответа',
  ready: 'Готово! Задача выполнена',
  blocked: 'Ошибка выполнения',
  dragging: 'Летим!',
  waving: 'Привет!',
  sleeping: 'Спит... Zzz',
};

/**
 * Smart UI summary formatting: removes boilerplates, strips long directory paths,
 * and extracts the core action for the compact speech bubble.
 */
export function formatDisplaySummary(raw: string): { text: string; icon: string } {
  let s = (raw || '').trim();
  if (!s) {
    return { text: 'В работе...', icon: 'terminal' };
  }

  // Standard Antigravity placeholders translations
  if (/^thinking(\.{0,3})?$/i.test(s) || s.toLowerCase().startsWith('thinking')) {
    return { text: 'Думаю...', icon: 'think' };
  }
  if (/^executing task\.{0,3}$/i.test(s) || /^running command\.{0,3}$/i.test(s) || /^running\.{0,3}$/i.test(s)) {
    return { text: 'Выполняю команду...', icon: 'terminal' };
  }
  if (/^processing request\.{0,3}$/i.test(s)) {
    return { text: 'Обрабатываю запрос...', icon: 'think' };
  }
  if (/^generating response\.{0,3}$/i.test(s)) {
    return { text: 'Пишу ответ...', icon: 'write' };
  }
  if (/^task completed/i.test(s)) {
    return { text: 'Готово! Задача выполнена', icon: 'check' };
  }
  if (/^awaiting user input/i.test(s)) {
    return { text: 'Жду твоего ответа', icon: 'question' };
  }

  // Strip PowerShell/CMD wrappers: powershell -NoProfile -Command "..." or cmd /c "..."
  s = s.replace(/^(powershell|pwsh)(\.exe)?\s+(-NoProfile|-ExecutionPolicy\s+\w+|-Command\s+)*-Command\s+["']?/i, '');
  s = s.replace(/^cmd(\.exe)?\s+\/c\s+["']?/i, '');
  s = s.replace(/["']\s*$/, '');

  const sLower = s.toLowerCase();

  // 1. Reading files
  if (
    sLower.includes('view_file') ||
    sLower.includes('read_url') ||
    sLower.includes('read_file') ||
    sLower.includes('reading') ||
    sLower.includes('viewing')
  ) {
    let target = s.replace(/^(view_file|read_file|reading|viewing|read|view)(:\s*|\s+)/i, '').trim();
    const basename = target.split(/[\/\\]/).pop() || target;
    return { text: basename ? `Читаю: ${basename}` : 'Читаю файл...', icon: 'read' };
  }

  // 2. Writing / Editing files
  if (
    sLower.includes('write_to_file') ||
    sLower.includes('replace_file_content') ||
    sLower.includes('writing') ||
    sLower.includes('editing') ||
    sLower.includes('edit')
  ) {
    let target = s.replace(/^(write_to_file|replace_file_content|writing|editing|write|edit)(:\s*|\s+)/i, '').trim();
    const basename = target.split(/[\/\\]/).pop() || target;
    return { text: basename ? `Пишу: ${basename}` : 'Пишу код...', icon: 'write' };
  }

  // 3. Search
  if (sLower.includes('search') || sLower.includes('grep') || sLower.includes('find')) {
    let query = s.replace(/^(search_web|search_code|searching|search|grep)(:\s*|\s+)/i, '').trim();
    query = query.replace(/[A-Za-z]:\\[^"'\s]+\\([^\\]+)/g, '$1');
    query = query.replace(/[A-Za-z]:\/[^"'\s]+\/([^\/]+)/g, '$1');
    return { text: query ? `Поиск: ${query}` : 'Ищу в коде...', icon: 'search' };
  }

  // 4. Command execution
  if (
    sLower.includes('run_command') ||
    sLower.startsWith('run:') ||
    sLower.includes('terminal') ||
    sLower.includes('npm ') ||
    sLower.includes('node ') ||
    sLower.includes('tasklist') ||
    sLower.includes('taskkill') ||
    sLower.includes('git ') ||
    sLower.includes('exec')
  ) {
    let cmd = s.replace(/^(running tool|running|run_command|run)(:\s*|\s+)/i, '').trim();
    cmd = cmd.replace(/^run_command(:\s*|\s+)/i, '').trim();

    if (cmd.includes('npm run build')) return { text: 'Команда: npm run build', icon: 'terminal' };
    if (cmd.includes('npm test')) return { text: 'Команда: npm test', icon: 'terminal' };
    if (cmd.includes('runner.js')) return { text: 'Тесты: runner.js', icon: 'terminal' };
    if (cmd.includes('verification-suite.js')) return { text: 'Тесты: verification', icon: 'terminal' };
    if (cmd.includes('taskkill')) return { text: 'Перезапуск процессов', icon: 'terminal' };
    if (cmd.includes('tasklist')) return { text: 'Проверка процессов', icon: 'terminal' };
    if (cmd.includes('git status')) return { text: 'Проверка git status', icon: 'terminal' };
    if (cmd.includes('git diff')) return { text: 'Просмотр git diff', icon: 'terminal' };

    // Strip absolute paths in arguments
    cmd = cmd.replace(/[A-Za-z]:\\[^"'\s]+\\([^\\]+)/g, '$1');
    cmd = cmd.replace(/[A-Za-z]:\/[^"'\s]+\/([^\/]+)/g, '$1');

    return { text: cmd ? `Команда: ${cmd}` : 'Выполняю команду...', icon: 'terminal' };
  }

  // General clean text with stripped absolute paths
  let cleaned = s.replace(/[A-Za-z]:\\[^"'\s]+\\([^\\]+)/g, '$1');
  cleaned = cleaned.replace(/[A-Za-z]:\/[^"'\s]+\/([^\/]+)/g, '$1');
  return { text: cleaned, icon: 'terminal' };
}

export class StatusBadge {
  private badgeElement: HTMLElement | null = null;
  private dotElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;
  private iconElement: HTMLCanvasElement | null = null;
  private iconCtx: CanvasRenderingContext2D | null = null;

  private isHovered = false;
  private isAutoPinned = false;
  private isBadgeVisible = false;
  private currentState: AgentState = 'idle';
  private currentSummary = 'В ожидании';
  private currentIconType = 'idle';
  private maxLength = 64;
  private thinkingInterval: any = null;
  private thinkingSeconds = 0;
  private tempOverrideTimeout: any = null;

  constructor(elements?: {
    badge?: HTMLElement | null;
    dot?: HTMLElement | null;
    text?: HTMLElement | null;
    icon?: HTMLCanvasElement | null;
  }) {
    if (elements) {
      this.badgeElement = elements.badge ?? null;
      this.dotElement = elements.dot ?? null;
      this.textElement = elements.text ?? null;
      if (elements.icon) {
        this.iconElement = elements.icon;
        this.iconCtx = elements.icon.getContext('2d');
      }
    }
  }

  public bindElements(
    badge: HTMLElement,
    dot: HTMLElement,
    text: HTMLElement,
    icon?: HTMLCanvasElement | null
  ): void {
    this.badgeElement = badge;
    this.dotElement = dot;
    this.textElement = text;
    if (icon) {
      this.iconElement = icon;
      this.iconCtx = icon.getContext('2d');
    }
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
    if (this.tempOverrideTimeout) {
      clearTimeout(this.tempOverrideTimeout);
      this.tempOverrideTimeout = null;
    }
    this.isHovered = false;
    this.isAutoPinned = false;
    this.syncVisibility();
  }

  public isVisible(): boolean {
    return this.isBadgeVisible;
  }

  public showTemporary(text: string, iconType = 'star', durationMs = 4000): void {
    if (this.tempOverrideTimeout) {
      clearTimeout(this.tempOverrideTimeout);
      this.tempOverrideTimeout = null;
    }
    this.currentSummary = text;
    this.currentIconType = iconType;
    this.isAutoPinned = true;
    this.render();
    this.syncVisibility();

    this.tempOverrideTimeout = setTimeout(() => {
      this.tempOverrideTimeout = null;
      this.updateState(this.currentState);
    }, durationMs);
    if (typeof this.tempOverrideTimeout?.unref === 'function') {
      this.tempOverrideTimeout.unref();
    }
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

    if (this.tempOverrideTimeout) {
      clearTimeout(this.tempOverrideTimeout);
      this.tempOverrideTimeout = null;
    }

    if (state !== 'thinking') {
      if (this.thinkingInterval) {
        clearInterval(this.thinkingInterval);
        this.thinkingInterval = null;
      }
      this.thinkingSeconds = 0;
    }

    if (state === 'thinking') {
      this.currentIconType = 'think';
      if (!this.thinkingInterval) {
        this.thinkingSeconds = 1;
        this.thinkingInterval = setInterval(() => {
          this.thinkingSeconds++;
          this.currentSummary = `Думаю ${this.thinkingSeconds}с...`;
          this.render();
        }, 1000);
        if (typeof this.thinkingInterval.unref === 'function') {
          this.thinkingInterval.unref();
        }
      }
      this.currentSummary = `Думаю ${this.thinkingSeconds}с...`;
    } else if (state === 'running') {
      const formatted = formatDisplaySummary(summary || '');
      this.currentIconType = formatted.icon;
      this.currentSummary = formatted.text;
    } else if (state === 'ready') {
      this.currentIconType = 'check';
      this.currentSummary =
        summary &&
        !summary.includes('Task completed') &&
        !summary.includes('ready') &&
        !summary.includes('task complete')
          ? summary.trim()
          : 'Готово! Задача выполнена';
    } else if (state === 'needs_input') {
      this.currentIconType = 'question';
      this.currentSummary =
        summary &&
        !summary.includes('Awaiting user') &&
        !summary.includes('waiting for input')
          ? summary.trim()
          : 'Жду твоего ответа';
    } else if (state === 'blocked') {
      this.currentIconType = 'warning';
      this.currentSummary =
        summary &&
        !summary.includes('Error / Blocked') &&
        !summary.includes('error')
          ? summary.trim()
          : 'Ошибка выполнения';
    } else if (state === 'sleeping') {
      this.currentIconType = 'sleep';
      this.currentSummary = 'Спит... Zzz';
    } else if (state === 'waving') {
      this.currentIconType = 'star';
      this.currentSummary = 'Привет!';
    } else if (state === 'dragging') {
      this.currentIconType = 'star';
      this.currentSummary = 'Летим!';
    } else {
      this.currentIconType = 'idle';
      if (summary && summary.trim().length > 0) {
        this.currentSummary = summary.trim();
      } else {
        this.currentSummary = DEFAULT_STATE_NAMES[state] || 'В ожидании';
      }
    }

    // Auto-pin badge during active execution and thinking states
    if (
      state === 'thinking' ||
      state === 'running' ||
      state === 'needs_input' ||
      state === 'blocked' ||
      state === 'ready'
    ) {
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

  public drawPixelIcon(type: string): void {
    if (!this.iconCtx || !this.iconElement) return;
    const ctx = this.iconCtx;
    ctx.clearRect(0, 0, 10, 10);

    switch (type) {
      case 'terminal':
        // Chevron >
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(1, 2, 1, 1);
        ctx.fillRect(2, 3, 1, 1);
        ctx.fillRect(3, 4, 1, 1);
        ctx.fillRect(2, 5, 1, 1);
        ctx.fillRect(1, 6, 1, 1);
        // Underscore cursor _
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(5, 6, 3, 1);
        break;

      case 'read':
        // Document page
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(2, 1, 5, 8);
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(3, 2, 3, 6);
        ctx.fillStyle = '#7DD3FC';
        ctx.fillRect(4, 3, 2, 1);
        ctx.fillRect(4, 5, 2, 1);
        ctx.fillRect(4, 7, 2, 1);
        break;

      case 'write':
        // Pencil
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(6, 1, 2, 2);
        ctx.fillRect(4, 3, 2, 2);
        ctx.fillRect(2, 5, 2, 2);
        ctx.fillStyle = '#FB7185';
        ctx.fillRect(7, 0, 2, 2);
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(1, 7, 1, 1);
        ctx.fillRect(1, 8, 2, 1);
        break;

      case 'search':
        // Magnifying glass
        ctx.fillStyle = '#A78BFA';
        ctx.fillRect(2, 1, 4, 1);
        ctx.fillRect(1, 2, 1, 3);
        ctx.fillRect(6, 2, 1, 3);
        ctx.fillRect(2, 5, 4, 1);
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(5, 5, 2, 2);
        ctx.fillRect(7, 7, 2, 2);
        break;

      case 'think':
        // Lightbulb
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(3, 1, 4, 1);
        ctx.fillRect(2, 2, 6, 3);
        ctx.fillRect(3, 5, 4, 1);
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(3, 6, 4, 1);
        ctx.fillRect(4, 7, 2, 1);
        break;

      case 'check':
      case 'ready':
        // Checkmark
        ctx.fillStyle = '#34D399';
        ctx.fillRect(1, 4, 1, 2);
        ctx.fillRect(2, 5, 1, 2);
        ctx.fillRect(3, 6, 1, 2);
        ctx.fillRect(4, 5, 1, 2);
        ctx.fillRect(5, 4, 1, 2);
        ctx.fillRect(6, 3, 1, 2);
        ctx.fillRect(7, 2, 1, 2);
        break;

      case 'question':
      case 'needs_input':
        // Question mark
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(3, 1, 4, 1);
        ctx.fillRect(2, 2, 2, 1);
        ctx.fillRect(6, 2, 2, 2);
        ctx.fillRect(4, 4, 2, 1);
        ctx.fillRect(4, 5, 2, 1);
        ctx.fillRect(4, 7, 2, 2);
        break;

      case 'warning':
      case 'blocked':
        // Alert mark
        ctx.fillStyle = '#F87171';
        ctx.fillRect(4, 1, 2, 4);
        ctx.fillRect(4, 6, 2, 2);
        break;

      case 'heart':
        // Pixel heart
        ctx.fillStyle = '#FB7185';
        ctx.fillRect(2, 2, 2, 2);
        ctx.fillRect(6, 2, 2, 2);
        ctx.fillRect(1, 3, 8, 2);
        ctx.fillRect(2, 5, 6, 1);
        ctx.fillRect(3, 6, 4, 1);
        ctx.fillRect(4, 7, 2, 1);
        break;

      case 'coffee':
        // Coffee mug
        ctx.fillStyle = '#93C5FD';
        ctx.fillRect(3, 1, 1, 1);
        ctx.fillRect(5, 0, 1, 1);
        ctx.fillRect(5, 2, 1, 1);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(2, 3, 5, 5);
        ctx.fillRect(7, 4, 2, 3);
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(8, 5, 1, 1);
        break;

      case 'sleep':
        // 'Z' letter
        ctx.fillStyle = '#818CF8';
        ctx.fillRect(2, 2, 5, 1);
        ctx.fillRect(5, 3, 2, 1);
        ctx.fillRect(4, 4, 2, 1);
        ctx.fillRect(3, 5, 2, 1);
        ctx.fillRect(2, 6, 5, 1);
        break;

      case 'star':
        // 4-pointed spark star
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(4, 1, 2, 7);
        ctx.fillRect(1, 4, 7, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(4, 4, 2, 2);
        break;

      case 'idle':
      default:
        // Gentle diamond
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(4, 2, 2, 2);
        ctx.fillRect(3, 4, 4, 2);
        ctx.fillRect(4, 6, 2, 2);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(4, 4, 2, 2);
        break;
    }
  }

  private render(): void {
    const color = this.getStateColor();
    const text = this.getRenderedText();

    if (this.dotElement) {
      this.dotElement.style.backgroundColor = color;
      this.dotElement.classList.toggle('thinking', this.currentState === 'thinking');
      this.dotElement.classList.toggle('pulsing', this.currentState === 'running');
    }

    if (this.iconElement) {
      this.drawPixelIcon(this.currentIconType);
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
