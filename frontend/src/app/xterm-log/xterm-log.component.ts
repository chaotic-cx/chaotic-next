import { Component, effect, ElementRef, input, OnDestroy, OnInit, output, viewChild } from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';

const DEFAULT_FONT_SIZE = 12;
const MOBILE_FONT_SIZE = 4;
const TABLET_FONT_SIZE = 9.5;
const MOBILE_MAX_WIDTH = 640;
const TABLET_MAX_WIDTH = 1024;
const SCROLLBACK_LINES = 9999999;
const PIXELS_PER_SCROLL_LINE = 16;
const SCROLLBAR_COLOR = '#f5e0dc';
const LINE_NUMBER_TOP_OFFSET_PX = 1;

const XTERM_THEME = {
  background: 'rgba(0, 0, 0, 0)',
  black: '#45475a',
  blue: '#89b4fa',
  brightBlack: '#585b70',
  brightBlue: '#89b4fa',
  brightCyan: '#94e2d5',
  brightGreen: '#a6e3a1',
  brightMagenta: '#f5c2e7',
  brightRed: '#f38ba8',
  brightWhite: '#a6adc8',
  brightYellow: '#f9e2af',
  cursor: '#f5e0dc',
  cursorAccent: '#f5e0dc',
  cyan: '#94e2d5',
  foreground: '#cdd6f4',
  green: '#a6e3a1',
  magenta: '#f5c2e7',
  red: '#f38ba8',
  white: '#bac2de',
  yellow: '#f9e2af',
};

@Component({
  selector: 'chaotic-xterm-log',
  template: `
    <div class="xterm-container">
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

      .xterm-container {
        flex: 1;
        min-height: 0;
        position: relative;
        display: flex;
        flex-direction: row;
        border: 1px solid var(--ctp-mocha-surface1);
        border-radius: 0.75rem;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        overflow: hidden;
        padding: 0.75rem;
      }

      :host ::ng-deep .xterm-viewport,
      :host ::ng-deep .xterm-scrollable-element,
      :host ::ng-deep .xterm-screen {
        background: transparent !important;
      }

      .terminal-gutter {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        width: auto;
        min-width: 1.5rem;
        margin-right: 1rem;
        overflow: hidden;
      }

      :host ::ng-deep .terminal-gutter .line-num {
        border: none;
        background: transparent;
        color: var(--ctp-mocha-text);
        font-family: inherit;
        width: 100%;
        text-align: center;
        padding: 0;
        cursor: pointer;
        user-select: none;
      }

      :host ::ng-deep .terminal-gutter .line-num:hover {
        color: var(--ctp-mocha-mauve);
      }

      .terminal-host {
        flex: 1;
        min-width: 0;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class XtermLogComponent implements OnInit, OnDestroy {
  readonly chunk = input<string[]>([]);
  readonly clearSignal = input<boolean>(false);
  readonly scrollToLine = input<number | undefined>(undefined);

  readonly lineClick = output<number>();

  private readonly terminalDiv = viewChild<ElementRef<HTMLDivElement>>('terminalDiv');
  private readonly gutter = viewChild<ElementRef<HTMLDivElement>>('gutter');

  private terminal?: Terminal;
  private fitAddon?: FitAddon;
  private serializeAddon?: SerializeAddon;
  private searchAddon?: SearchAddon;
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      this.receivedLength = this.chunk().length;
      this.scheduleFlush();
    });

    effect(() => {
      if (this.clearSignal()) {
        this.receivedLength = 0;
        this.consumedLength = 0;
        this.flushScheduled = false;
        this.lineScrolled = false;
        this.logicalLineStarts = [];
        this.lastMappedLength = -1;
        this.lastMappedCols = -1;
        this.clearFlushTimer();
        this.terminal?.clear();
        this.terminal?.reset();
      }
    });
  }

  private receivedLength = 0;
  private consumedLength = 0;
  private flushScheduled = false;
  private flushTimer: number | undefined;
  private lineScrolled = false;

  /** Buffer row where each logical (un-wrapped) line starts; re-mapped on re-wrap. */
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
    }, XtermLogComponent.FLUSH_DELAY_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== undefined) window.clearTimeout(this.flushTimer);
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
      if (bytes >= XtermLogComponent.MAX_FLUSH_BYTES) break;
    }
    const delta = chunks.slice(this.consumedLength, end).join('');
    this.consumedLength = end;
    const normalized = this.normalizeChunk(delta);
    if (normalized) {
      this.terminal.write(normalized, () => this.afterWrite());
    }

    if (this.consumedLength < this.receivedLength) this.scheduleFlush();
  }

  private afterWrite(): void {
    if (!this.terminal || this.lineScrolled) return;
    const line = this.scrollToLine();
    this.ensureLogicalLineMapping();
    const bufferRow = line === undefined ? undefined : this.logicalLineStarts[line - 1];
    if (bufferRow === undefined) {
      this.terminal.scrollToBottom();
      return;
    }
    this.highlightLine(bufferRow);
    this.terminal.scrollToLine(bufferRow);
    this.lineScrolled = true;
    this.updateLineNumbers();
  }

  private highlightLine(bufferIndex: number): void {
    if (!this.terminal) return;
    const cursor = this.terminal.buffer.active.baseY + this.terminal.buffer.active.cursorY;
    try {
      const marker = this.terminal.registerMarker(bufferIndex - cursor);
      if (!marker) return;
      this.terminal.registerDecoration({
        marker,
        layer: 'bottom',
        backgroundColor: '#313244',
        width: this.terminal.cols,
      });
    } catch {
      // Marker/decoration APIs can fail for out-of-range lines; ignore.
    }
  }

  private readonly onGutterClick = (event: Event): void => {
    const target =
      event.target instanceof HTMLElement ? (event.target.closest('.line-num') as HTMLElement | null) : null;
    const raw = target?.dataset['line'];
    if (!raw) return;
    this.lineClick.emit(Number(raw));
  };

  /** Reads gutter layout once; cached to avoid forced reflows per scroll. */
  private measureGutter(): void {
    const terminal = this.terminal;
    const gutterEl = this.gutter()?.nativeElement;
    const host = this.terminalDiv()?.nativeElement;
    if (!terminal || !gutterEl || !host) return;
    const screen = host.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screen || !screen.clientHeight) return;
    this.gutterRows = terminal.rows;
    this.gutterCellHeightPx = screen.clientHeight / terminal.rows;
    this.gutterTopOffsetPx = screen.getBoundingClientRect().top - gutterEl.getBoundingClientRect().top;
    this.gutterFontSizePx = `${terminal.options.fontSize ?? DEFAULT_FONT_SIZE}px`;
  }

  private updateLineNumbers(): void {
    const terminal = this.terminal;
    const gutterEl = this.gutter()?.nativeElement;
    if (!terminal || !gutterEl || this.gutterRows === 0) return;
    this.ensureLogicalLineMapping();
    const start = terminal.buffer.active.viewportY;

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
        button.setAttribute('aria-label', `Line ${logicalLine}`);
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
      if (!line || !line.isWrapped) starts.push(i);
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
    requestAnimationFrame(() => {
      this.initTerminal();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.terminal?.dispose();
  }

  private normalizeChunk(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  }

  downloadLog(filename: string): void {
    const text = this.serializeAddon?.serialize() ?? '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  findNext(query: string): void {
    if (!query) return;
    this.searchAddon?.findNext(query);
  }

  findPrevious(query: string): void {
    if (!query) return;
    this.searchAddon?.findPrevious(query);
  }

  private getResponsiveFontSize(): number {
    if (typeof window === 'undefined') return DEFAULT_FONT_SIZE;
    const width = window.innerWidth;
    if (width <= MOBILE_MAX_WIDTH) return MOBILE_FONT_SIZE;
    if (width <= TABLET_MAX_WIDTH) return TABLET_FONT_SIZE;
    return DEFAULT_FONT_SIZE;
  }

  private initTerminal(): void {
    const container = this.terminalDiv()?.nativeElement;
    if (!container) return;

    this.terminal = new Terminal({
      allowProposedApi: true,
      disableStdin: true,
      scrollback: SCROLLBACK_LINES,
      convertEol: true,
      fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
      fontSize: this.getResponsiveFontSize(),
      lineHeight: 1.2,
      theme: XTERM_THEME,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.serializeAddon = new SerializeAddon();
    this.terminal.loadAddon(this.serializeAddon);

    this.searchAddon = new SearchAddon();
    this.terminal.loadAddon(this.searchAddon);

    this.terminal.loadAddon(
      new WebLinksAddon((event, uri) => {
        void event;
        const link = document.createElement('a');
        link.href = uri;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }),
    );

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      this.terminal.loadAddon(webglAddon);
    } catch {
      // Fallback to standard canvas renderer if WebGL unavailable
    }

    this.terminal.open(container);

    this.terminal.onScroll(() => this.scheduleGutterUpdate());
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

    const viewport = container.querySelector('.xterm-viewport') as HTMLElement | null;
    if (viewport) {
      viewport.setAttribute(
        'style',
        `scrollbar-color: ${SCROLLBAR_COLOR} transparent; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important;`,
      );
    }

    this.fitAddon.fit();
    this.measureGutter();
    this.updateLineNumbers();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.terminal) {
        const newFontSize = this.getResponsiveFontSize();
        if (this.terminal.options.fontSize !== newFontSize) {
          this.terminal.options.fontSize = newFontSize;
        }
      }
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
