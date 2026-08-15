import { Component, ElementRef, OnDestroy, OnInit, effect, input, viewChild } from '@angular/core';
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
const BACKGROUND_COLOR = '#1e1e2e';
const SCROLLBAR_COLOR = '#f5e0dc';

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
        background: ${BACKGROUND_COLOR};
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        overflow: hidden;
        padding: 0.75rem;
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
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const data = this.chunk();
      if (data && this.terminal) {
        this.terminal.write(data);
        this.terminal.scrollToBottom();
      }
    });

    effect(() => {
      if (this.clearSignal() && this.terminal) {
        this.terminal.clear();
        this.terminal.reset();
      }
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
        background: BACKGROUND_COLOR,
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
        `background-color: ${BACKGROUND_COLOR}; scrollbar-color: ${SCROLLBAR_COLOR} ${BACKGROUND_COLOR}; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important;`,
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

    const initialChunk = this.chunk();
    if (initialChunk) {
      this.terminal.write(initialChunk);
    }
  }
}
