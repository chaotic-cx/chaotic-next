import { Component, computed, effect, ElementRef, inject, input, output, signal } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { HighlightJS } from 'ngx-highlightjs';
import { lineFlashKeyframes } from '../animations/line-flash';
import { prefersReducedMotion } from '../functions';

const DEFAULT_LANGUAGE = 'bash';
const FLASH_DURATION_MS = 1500;
// The flash starts once the smooth scroll arrives.
const FLASH_DELAY_MS = 400;

interface SourceLine {
  html: string;
  number: number;
}

@Component({
  selector: 'chaotic-source-viewer',
  templateUrl: './source-viewer.component.html',
  styleUrl: './source-viewer.component.css',
})
export class SourceViewerComponent {
  private readonly hljs = inject(HighlightJS);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly code = input.required<string>();
  readonly language = input(DEFAULT_LANGUAGE);
  readonly findingsByLine = input<ReadonlyMap<number, DiffScanFinding[]>>(new Map<number, DiffScanFinding[]>());

  readonly scrollToLine = input<number | null>(null);
  readonly scrolled = output<void>();

  protected readonly expandedLine = signal<number | null>(null);
  protected readonly lines = signal<SourceLine[]>([]);

  // The line number column fits the longest number, so files with 1000+ lines stay aligned.
  protected readonly lineNumberWidth = computed(() => `${String(this.lines().length).length}ch`);

  private highlightToken = 0;

  constructor() {
    effect(() => {
      const code = this.code();
      const language = this.language();
      void this.highlightLines(code, language);
    });

    effect(() => {
      const target = this.scrollToLine();
      const rendered = this.lines().length > 0;
      if (target === null || !rendered) return;
      requestAnimationFrame(() => this.revealLine(target));
    });
  }

  /** Scrolls to the row and flashes it, then reports back so the parent can reset the target. */
  private revealLine(lineNumber: number): void {
    const row = this.host.nativeElement.querySelector<HTMLElement>(`[data-line="${lineNumber}"]`);
    this.scrolled.emit();
    if (!row) return;

    const reducedMotion = prefersReducedMotion();
    row.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    if (reducedMotion) return;

    row.animate(lineFlashKeyframes(), { duration: FLASH_DURATION_MS, delay: FLASH_DELAY_MS, easing: 'ease-out' });
  }

  protected findingsFor(lineNumber: number): DiffScanFinding[] | undefined {
    const findings = this.findingsByLine().get(lineNumber);
    return findings && findings.length > 0 ? findings : undefined;
  }

  protected toggle(lineNumber: number): void {
    if (this.findingsFor(lineNumber) === undefined) return;
    this.expandedLine.set(this.expandedLine() === lineNumber ? null : lineNumber);
  }

  private async highlightLines(code: string, language: string): Promise<void> {
    const token = ++this.highlightToken;
    const highlighted = await Promise.all(
      code
        .split('\n')
        .map(async (line) =>
          line.trim() === '' ? '' : (await this.hljs.highlight(line, { language, ignoreIllegals: true })).value,
        ),
    );
    if (token !== this.highlightToken) return;
    this.lines.set(highlighted.map((html, index) => ({ html, number: index + 1 })));
  }
}
