import { Component, effect, inject, input, signal } from '@angular/core';
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

  readonly code = input.required<string>();
  readonly language = input(DEFAULT_LANGUAGE);
  readonly findingsByLine = input<ReadonlyMap<number, DiffScanFinding[]>>(new Map<number, DiffScanFinding[]>());

  protected readonly expandedLine = signal<number | null>(null);
  protected readonly lines = signal<SourceLine[]>([]);

  private highlightToken = 0;

  constructor() {
    effect(() => {
      const code = this.code();
      const language = this.language();
      void this.highlightLines(code, language);
    });
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
