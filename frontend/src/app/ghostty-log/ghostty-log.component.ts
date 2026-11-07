import { Component, effect, ElementRef, inject, input, OnDestroy, OnInit, output, viewChild } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { FitAddon, init, type ITheme, Terminal, UrlRegexProvider } from 'ghostty-web';
import { flavour, LIGHT_FLAVOUR, themePalette } from '../theme';

const DEFAULT_FONT_SIZE = 12;
const SCROLLBACK_LIMIT = 100000000;
const PIXELS_PER_SCROLL_LINE = 16;
const LINE_NUMBER_TOP_OFFSET_PX = 1;
const GUTTER_MIN_FONT_SIZE_PX = 10;
const TRANSPARENT_BACKGROUND = '#00000000';
const TERMINAL_FONT_FAMILY = "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace";

type SearchStep = 1 | -1;

interface SearchMatch {
  row: number;
  col: number;
}

let ghosttyReady: Promise<void> | undefined;

// The WASM module loads once. Every terminal shares it.
function loadGhostty(): Promise<void> {
  ghosttyReady ??= init();
  return ghosttyReady;
}

// `document.fonts.ready` does not wait for a font that no element uses yet, so the font is requested here.
async function loadTerminalFont(): Promise<void> {
  try {
    await document.fonts.load(`${DEFAULT_FONT_SIZE}px ${TERMINAL_FONT_FAMILY}`);
  } catch {
    // The fallback monospace font is measured instead.
  }
}

/**
 * ANSI colours from the active flavour. Latte maps the "white" and "black" slots to readable
 * text tones, because logs print white text that would vanish on a light surface.
 */
function terminalTheme(): ITheme {
  const palette = themePalette();
  const isLight = flavour() === LIGHT_FLAVOUR;
  return {
    background: TRANSPARENT_BACKGROUND,
    black: isLight ? palette.subtext1.hex : palette.surface1.hex,
    blue: palette.blue.hex,
    brightBlack: isLight ? palette.overlay1.hex : palette.overlay0.hex,
    brightBlue: palette.blue.hex,
    brightCyan: palette.teal.hex,
    brightGreen: palette.green.hex,
    brightMagenta: palette.pink.hex,
    brightRed: palette.red.hex,
    brightWhite: isLight ? palette.subtext1.hex : palette.overlay2.hex,
    brightYellow: palette.yellow.hex,
    cursor: palette.rosewater.hex,
    cursorAccent: palette.rosewater.hex,
    cyan: palette.teal.hex,
    foreground: palette.text.hex,
    green: palette.green.hex,
    magenta: palette.pink.hex,
    red: palette.red.hex,
    white: isLight ? palette.subtext0.hex : palette.overlay1.hex,
    yellow: palette.yellow.hex,
  };
}

/** Column of every case-insensitive, non-overlapping occurrence of `needle` in `text`. */
function matchColumns(text: string, needle: string): number[] {
  const columns: number[] = [];
  for (let col = text.indexOf(needle); col !== -1; col = text.indexOf(needle, col + needle.length)) {
    columns.push(col);
  }

  return columns;
}

@Component({
  selector: 'chaotic-ghostty-log',
  template: `
    <div class="terminal-container">
      <div class="terminal-gutter" #gutter></div>
      <div class="terminal-host" #terminalDiv></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        width: 100%;
      }

      .terminal-container {
        flex: 1;
        min-height: 0;
        position: relative;
        display: flex;
        flex-direction: row;
        overflow: hidden;
        padding: var(--chaotic-space-md);
        padding-right: 0;
      }

      .terminal-gutter {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        width: auto;
        min-width: 2.5rem;
        margin-right: 1rem;
        scrollbar-width: thin;
      }

      :host ::ng-deep .terminal-gutter .line-num {
        border: none;
        background: transparent;
        color: var(--catppuccin-color-text);
        font-family: inherit;
        width: 100%;
        text-align: center;
        padding: 0;
        cursor: pointer;
        user-select: none;
      }

      :host ::ng-deep .terminal-gutter .line-num:hover,
      :host ::ng-deep .terminal-gutter .line-num:focus-visible {
        color: var(--catppuccin-color-mauve);
      }

      .terminal-host {
        flex: 1;
        min-width: 0;
        height: 100%;
        overflow: hidden;
      }

      @media (max-width: 640px) {
        .terminal-gutter {
          display: none;
        }
      }
    `,
  ],
})
export class GhosttyLogComponent implements OnInit, OnDestroy {
  private readonly transloco = inject(TranslocoService);

  readonly chunk = input<string[]>([]);
  readonly clearSignal = input<boolean>(false);
  readonly scrollToLine = input<number | undefined>(undefined);

  readonly lineClick = output<number>();

  private readonly terminalDiv = viewChild<ElementRef<HTMLDivElement>>('terminalDiv');
  private readonly gutter = viewChild<ElementRef<HTMLDivElement>>('gutter');

  private terminal?: Terminal;
  private fitAddon?: FitAddon;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;
  private searchQuery = '';
  private searchIndex = -1;

  constructor() {
    effect(() => {
      if (this.clearSignal()) {
        this.resetTerminal();
      }
    });

    effect(() => {
      const theme = terminalTheme();
      if (this.terminal) {
        this.terminal.options.theme = theme;
      }
    });

    effect(() => {
      const length = this.chunk().length;

      // A shorter chunk list than already written means that the host started a new log.
      if (length < this.consumedLength) {
        this.resetTerminal();
      }

      this.receivedLength = length;
      this.scheduleFlush();
    });
  }

  private resetTerminal(): void {
    this.receivedLength = 0;
    this.consumedLength = 0;
    this.flushScheduled = false;
    this.lineScrolled = false;
    this.following = true;
    this.logicalLineStarts = [];
    this.lastMappedLength = -1;
    this.lastMappedCols = -1;
    this.clearFlushTimer();
    this.terminal?.clear();
    this.terminal?.reset();
  }

  private receivedLength = 0;
  private consumedLength = 0;
  private flushScheduled = false;
  private flushTimer: number | undefined;
  private lineScrolled = false;
  private following = true;

  /** Buffer row where each logical (un-wrapped) line starts. Re-mapped on re-wrap. */
  private logicalLineStarts: number[] = [];
  private lastMappedLength = -1;
  private lastMappedCols = -1;

  private gutterRows = 0;
  private gutterCellHeightPx = 0;
  private gutterTopOffsetPx = 0;
  private gutterFontSizePx = '';
  private lastGutterViewportStart = -1;
  private gutterButtons: HTMLButtonElement[] = [];
  private gutterUpdateRaf = 0;

  private static readonly MAX_FLUSH_BYTES = 64 * 1024;
  private static readonly FLUSH_DELAY_MS = 16;

  private scheduleFlush(): void {
    if (this.flushScheduled) return;

    this.flushScheduled = true;
    this.flushTimer = window.setTimeout(() => {
      this.flushScheduled = false;
      this.flushTimer = undefined;
      this.flush();
    }, GhosttyLogComponent.FLUSH_DELAY_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== undefined) {
      window.clearTimeout(this.flushTimer);
    }

    this.flushTimer = undefined;
  }

  private flush(): void {
    if (!this.terminal || this.receivedLength <= this.consumedLength) return;

    const chunks = this.chunk();

    let bytes = 0;
    let end = this.consumedLength;
    while (end < chunks.length) {
      bytes += chunks[end].length;
      end++;
      if (bytes >= GhosttyLogComponent.MAX_FLUSH_BYTES) break;
    }

    const delta = chunks.slice(this.consumedLength, end).join('');
    this.consumedLength = end;
    const normalized = this.normalizeChunk(delta);
    if (normalized) {
      this.terminal.write(normalized, () => this.afterWrite());
    }

    if (this.consumedLength < this.receivedLength) {
      this.scheduleFlush();
    }
  }

  private afterWrite(): void {
    if (!this.terminal) return;
    if (this.scrollToRequestedLine()) return;

    if (this.following) {
      this.terminal.scrollToBottom();
    }
  }

  private scrollToRequestedLine(): boolean {
    const line = this.scrollToLine();
    if (!this.terminal || this.lineScrolled || line === undefined) return false;

    this.ensureLogicalLineMapping();
    const bufferRow = this.logicalLineStarts[line - 1];
    if (bufferRow === undefined) return false;

    this.highlightLine(bufferRow);
    this.scrollToRow(bufferRow);
    this.lineScrolled = true;
    this.updateFollowing();
    this.updateLineNumbers();

    return true;
  }

  private updateFollowing(): void {
    if (!this.terminal) return;

    this.following = this.terminal.getViewportY() === 0;
  }

  /**
   * Buffer row at the top of the viewport. `buffer.active.viewportY` stays 0 in ghostty-web, so it is not used.
   * Smooth scroll makes `getViewportY()` fractional. The renderer rounds it down, so the gutter does too.
   */
  private topRow(): number {
    if (!this.terminal) return 0;

    return this.terminal.getScrollbackLength() - Math.floor(this.terminal.getViewportY());
  }

  /** ghostty-web counts the scroll offset from the bottom, not a buffer row. */
  private scrollToRow(row: number): void {
    const terminal = this.terminal;
    if (!terminal) return;

    terminal.scrollToLine(Math.max(0, terminal.getScrollbackLength() - row));
  }

  /** ghostty-web has no line decorations. The selection marks the line instead. */
  private highlightLine(bufferIndex: number): void {
    const terminal = this.terminal;
    if (!terminal) return;

    terminal.select(0, bufferIndex, terminal.cols);
  }

  private readonly onGutterClick = (event: Event): void => {
    const target =
      event.target instanceof HTMLElement ? (event.target.closest('.line-num') as HTMLElement | null) : null;
    const raw = target?.dataset['line'];
    if (!raw) return;

    this.lineClick.emit(Number(raw));
  };

  /** Reads gutter layout once. The result is cached to avoid forced reflows per scroll. */
  private measureGutter(): void {
    const terminal = this.terminal;
    const gutterEl = this.gutter()?.nativeElement;
    const host = this.terminalDiv()?.nativeElement;
    if (!terminal || !gutterEl || !host) return;

    const screen = host.querySelector('canvas');
    if (!screen?.clientHeight) return;

    this.gutterRows = terminal.rows;
    this.gutterCellHeightPx = screen.clientHeight / terminal.rows;
    this.gutterTopOffsetPx = screen.getBoundingClientRect().top - gutterEl.getBoundingClientRect().top;
    const cellFontSize = Math.max(
      GUTTER_MIN_FONT_SIZE_PX,
      Math.min(terminal.options.fontSize ?? DEFAULT_FONT_SIZE, this.gutterCellHeightPx),
    );
    this.gutterFontSizePx = `${cellFontSize}px`;
  }

  private updateLineNumbers(): void {
    const terminal = this.terminal;
    const gutterEl = this.gutter()?.nativeElement;
    if (!terminal || !gutterEl || this.gutterRows === 0) return;

    this.ensureLogicalLineMapping();
    const start = this.topRow();
    if (start === this.lastGutterViewportStart && this.gutterButtons.length > 0) return;

    this.lastGutterViewportStart = start;

    if (this.gutterButtons.length !== this.gutterRows) {
      gutterEl.textContent = '';
      this.gutterButtons = [];
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < this.gutterRows; i++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'line-num';
        button.style.fontSize = this.gutterFontSizePx;
        button.style.height = `${this.gutterCellHeightPx}px`;
        button.style.lineHeight = `${this.gutterCellHeightPx}px`;
        this.gutterButtons.push(button);
        fragment.appendChild(button);
      }

      gutterEl.appendChild(fragment);
    }

    gutterEl.style.paddingTop = `${Math.max(0, this.gutterTopOffsetPx) + LINE_NUMBER_TOP_OFFSET_PX}px`;
    for (let r = 0; r < this.gutterRows; r++) {
      const bufferRow = start + r;
      const line = terminal.buffer.active.getLine(bufferRow);
      const logicalLine = this.logicalNumberForRow(bufferRow, line?.isWrapped);
      const button = this.gutterButtons[r];
      button.textContent = logicalLine === undefined ? '' : String(logicalLine);
      if (logicalLine !== undefined) {
        button.dataset['line'] = String(logicalLine);
        button.setAttribute('aria-label', this.transloco.translate('ghosttyLog.lineLabel', { line: logicalLine }));
      } else {
        delete button.dataset['line'];
        button.removeAttribute('aria-label');
      }
    }
  }

  private ensureLogicalLineMapping(): void {
    const buffer = this.terminal?.buffer.active;
    if (!buffer) return;

    const cols = this.terminal?.cols ?? 0;
    if (buffer.length === this.lastMappedLength && cols === this.lastMappedCols) return;

    this.lastMappedLength = buffer.length;
    this.lastMappedCols = cols;
    const starts: number[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (!line?.isWrapped) {
        starts.push(i);
      }
    }

    this.logicalLineStarts = starts;
  }

  private logicalNumberForRow(bufferRow: number, wrapped: boolean | undefined): number | undefined {
    if (wrapped) return undefined;

    const starts = this.logicalLineStarts;
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (starts[mid] <= bufferRow) low = mid + 1;
      else high = mid;
    }

    return low > 0 ? low : undefined;
  }

  private scheduleGutterUpdate(): void {
    if (this.gutterUpdateRaf) return;

    this.gutterUpdateRaf = requestAnimationFrame(() => {
      this.gutterUpdateRaf = 0;
      this.updateLineNumbers();
    });
  }

  ngOnInit(): void {
    void Promise.all([loadGhostty(), loadTerminalFont()]).then(() => {
      if (this.destroyed) return;

      requestAnimationFrame(() => this.initTerminal());
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.terminal?.dispose();
  }

  private normalizeChunk(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  }

  /** Writes the whole scrollback. Wrapped rows join the row above, so long lines stay whole. */
  private bufferText(): string {
    const buffer = this.terminal?.buffer.active;
    if (!buffer) return '';

    const lines: string[] = [];
    for (let row = 0; row < buffer.length; row++) {
      const line = buffer.getLine(row);
      const text = line?.translateToString(true) ?? '';
      if (line?.isWrapped && lines.length > 0) {
        lines[lines.length - 1] += text;
      } else {
        lines.push(text);
      }
    }

    return lines.join('\n');
  }

  downloadLog(filename: string): void {
    const text = this.bufferText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  findNext(query: string): void {
    this.moveSearch(query, 1);
  }

  findPrevious(query: string): void {
    this.moveSearch(query, -1);
  }

  private moveSearch(query: string, step: SearchStep): void {
    if (!query) return;

    const matches = this.findMatches(query);
    if (matches.length === 0) return;

    if (query !== this.searchQuery) {
      this.searchQuery = query;
      this.searchIndex = step === 1 ? -1 : matches.length;
    }

    this.searchIndex = (this.searchIndex + step + matches.length) % matches.length;
    this.revealMatch(matches[this.searchIndex], query.length);
  }

  private findMatches(query: string): SearchMatch[] {
    const buffer = this.terminal?.buffer.active;
    if (!buffer) return [];

    const needle = query.toLowerCase();
    const matches: SearchMatch[] = [];
    for (let row = 0; row < buffer.length; row++) {
      const text = buffer.getLine(row)?.translateToString(true).toLowerCase() ?? '';
      for (const col of matchColumns(text, needle)) {
        matches.push({ row, col });
      }
    }

    return matches;
  }

  private revealMatch(match: SearchMatch, length: number): void {
    if (!this.terminal) return;

    this.terminal.select(match.col, match.row, length);
    this.scrollToRow(match.row);
    this.updateFollowing();
    this.updateLineNumbers();
  }

  private initTerminal(): void {
    const container = this.terminalDiv()?.nativeElement;
    if (!container) return;

    this.terminal = new Terminal({
      allowTransparency: true,
      disableStdin: true,
      scrollback: SCROLLBACK_LIMIT,
      convertEol: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      theme: terminalTheme(),
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.terminal.open(container);
    this.terminal.registerLinkProvider(new UrlRegexProvider(this.terminal));

    this.terminal.onScroll(() => {
      this.updateFollowing();
      this.scheduleGutterUpdate();
    });
    this.terminal.onResize(() => {
      this.lastGutterViewportStart = -1;
      this.updateLineNumbers();
    });
    this.gutter()?.nativeElement.addEventListener('click', this.onGutterClick);

    this.terminal.attachCustomKeyEventHandler(() => false);

    let lastTouchY = 0;
    container.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length === 1) {
          lastTouchY = e.touches[0].clientY;
        }
      },
      { passive: true },
    );

    let accumulatedDeltaY = 0;
    container.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (e.touches.length === 1 && this.terminal) {
          e.preventDefault();
          const currentY = e.touches[0].clientY;
          const deltaY = lastTouchY - currentY;
          lastTouchY = currentY;

          accumulatedDeltaY += deltaY;
          const lineDelta = Math.trunc(accumulatedDeltaY / PIXELS_PER_SCROLL_LINE);
          if (lineDelta !== 0) {
            this.terminal.scrollLines(lineDelta);
            accumulatedDeltaY %= PIXELS_PER_SCROLL_LINE;
          }
        }
      },
      { passive: false },
    );

    this.fitAddon.fit();
    this.measureGutter();
    this.updateLineNumbers();

    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        this.fitAddon?.fit();
        this.measureGutter();
        this.updateLineNumbers();
      });
    });
    this.resizeObserver.observe(container);

    this.flush();
  }
}
