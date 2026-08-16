import { Component, ElementRef, OnDestroy, OnInit, effect, input, viewChild } from '@angular/core';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';

const DEFAULT_FONT_SIZE = 12;
const MOBILE_FONT_SIZE = 7.5;
const TABLET_FONT_SIZE = 9.5;
const MOBILE_MAX_WIDTH = 640;
const TABLET_MAX_WIDTH = 1024;
const SCROLLBACK_LINES = 9999999;
const PIXELS_PER_SCROLL_LINE = 16;
const SCROLLBAR_COLOR = '#f5e0dc';

const ESC = String.fromCharCode(27);
const C1_ESC = String.fromCharCode(155);
const BEL = String.fromCharCode(7);

const ANSI_ESCAPE = new RegExp(
  `[${ESC}${C1_ESC}][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*)?${BEL})|(?:(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))`,
  'g',
);

@Component({
  selector: 'chaotic-xterm-log',
  template: `
    <div class="xterm-container">
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
        flex-direction: column;
        border: 1px solid var(--ctp-mocha-surface1);
        border-radius: 0.75rem;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        overflow: hidden;
        padding: 0.75rem;
      }

      :host ::ng-deep .xterm-viewport,
      :host ::ng-deep .xterm-scrollable-element,
      :host ::ng-deep .xterm-screen {
        background: transparent !important;
      }

      .terminal-host {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class XtermLogComponent implements OnInit, OnDestroy {
  readonly chunk = input<string>('');
  readonly clearSignal = input<boolean>(false);

  private readonly terminalDiv = viewChild<ElementRef<HTMLDivElement>>('terminalDiv');

  private terminal?: Terminal;
  private fitAddon?: FitAddon;
  private serializeAddon?: SerializeAddon;
  private searchAddon?: SearchAddon;
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const text = this.chunk();
      if (!text) return;
      const delta = text.slice(this.writtenLength);
      this.writtenLength = text.length;
      if (delta) {
        this.pending += delta;
        this.flushPending();
      }
    });

    effect(() => {
      if (this.clearSignal()) {
        this.writtenLength = 0;
        this.pending = '';
        this.terminal?.clear();
        this.terminal?.reset();
      }
    });
  }

  private pending = '';
  private writtenLength = 0;

  private flushPending(): void {
    if (!this.terminal || !this.pending) return;
    const text = this.pending;
    this.pending = '';
    const normalized = this.normalizeChunk(text);
    if (normalized) {
      this.terminal.write(normalized);
      this.terminal.scrollToBottom();
    }
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
    const startsWithNewline = /^\r?\n/.test(text);
    const endsWithNewline = /\r?\n$/.test(text);
    const normalized = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .filter((line) => this.hasVisibleText(line))
      .join('\n');
    return `${startsWithNewline ? '\n' : ''}${normalized}${endsWithNewline ? '\n' : ''}`;
  }

  private hasVisibleText(line: string): boolean {
    return line.replace(ANSI_ESCAPE, '').replace(/\s/g, '').length > 0;
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
      disableStdin: true,
      scrollback: SCROLLBACK_LINES,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: this.getResponsiveFontSize(),
      lineHeight: 1.2,
      theme: {
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
      },
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

    this.resizeObserver = new ResizeObserver(() => {
      if (this.terminal) {
        const newFontSize = this.getResponsiveFontSize();
        if (this.terminal.options.fontSize !== newFontSize) {
          this.terminal.options.fontSize = newFontSize;
        }
      }
      requestAnimationFrame(() => {
        this.fitAddon?.fit();
      });
    });
    this.resizeObserver.observe(container);

    this.flushPending();
  }
}
