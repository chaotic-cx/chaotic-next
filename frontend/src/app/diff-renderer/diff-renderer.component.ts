import { Component, computed, input } from '@angular/core';

const HUNK_START = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

@Component({
  selector: 'chaotic-diff-renderer',
  templateUrl: './diff-renderer.component.html',
  styleUrl: './diff-renderer.component.css',
  imports: [],
})
export class DiffRendererComponent {
  readonly diff = input.required<string>();

  readonly highlightLines = input<ReadonlySet<number>>(new Set<number>());

  readonly parsedLines = computed(() => {
    if (!this.diff()) return [];

    const lines = this.diff().split('\n');
    const result: DiffLine[] = [];
    let inHunk = false;
    let newLineNumber = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const start = line.match(HUNK_START);
        if (start) {
          newLineNumber = Number.parseInt(start[1] ?? '1', 10);
          inHunk = true;
        }
        result.push({ type: 'hunk-header', content: line });
      } else if (line.startsWith('\\')) {
        result.push({ type: 'context', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        result.push({ type: 'added', content: line, lineNumber: inHunk ? newLineNumber : undefined });
        if (inHunk) newLineNumber++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        result.push({ type: 'removed', content: line });
      } else {
        result.push({ type: 'context', content: line, lineNumber: inHunk ? newLineNumber : undefined });
        if (inHunk) newLineNumber++;
      }
    }

    return result;
  });

  getLineClass(line: DiffLine): string {
    const highlighted = line.lineNumber !== undefined && this.highlightLines().has(line.lineNumber);
    return highlighted ? `${line.type} highlighted` : line.type;
  }
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'hunk-header';
  content: string;
  lineNumber?: number;
}
