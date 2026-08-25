import { Component, effect, ElementRef, inject, input, output, signal } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { HighlightJS } from 'ngx-highlightjs';

const DEFAULT_LANGUAGE = 'bash';

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

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    if (reducedMotion) return;

    // Start flashing once the smooth scroll has arrived.
    row.animate(
      [
        { boxShadow: 'inset 0 0 0 999px rgba(203, 166, 247, 0)' },
        { boxShadow: 'inset 0 0 0 999px rgba(203, 166, 247, 0.38)', offset: 0.2 },
        { boxShadow: 'inset 0 0 0 999px rgba(203, 166, 247, 0.38)', offset: 0.65 },
        { boxShadow: 'inset 0 0 0 999px rgba(203, 166, 247, 0)' },
      ],
      { duration: 1500, delay: 400, easing: 'ease-out' },
    );
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
