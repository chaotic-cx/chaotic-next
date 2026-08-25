import { Component, computed, effect, ElementRef, inject, input, output, signal } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { diffWords, type WordSegment } from './word-diff';

const HUNK_START = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_MARKER_LENGTH = 1;

@Component({
  selector: 'chaotic-diff-renderer',
  templateUrl: './diff-renderer.component.html',
  styleUrl: './diff-renderer.component.css',
  imports: [],
  preserveWhitespaces: false,
})
export class DiffRendererComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly diff = input.required<string>();

  /** Findings for this file keyed by the new-file line number they hit. */
  readonly findingsByLine = input<ReadonlyMap<number, DiffScanFinding[]>>(new Map<number, DiffScanFinding[]>());

  /** When set, scrolls the row into view and flashes it; reset via `scrolled`. */
  readonly scrollToLine = input<number | null>(null);
  readonly scrolled = output<void>();

  /** The new-file line number whose findings are expanded inline, if any. */
  readonly expandedLine = signal<number | null>(null);

  readonly parsedLines = computed(() => {
    if (!this.diff()) return [];

    const lines = this.diff().split('\n');
    const result: DiffLine[] = [];
    let inHunk = false;
    let newLineNumber = 0;
    const pendingRemoved: DiffLine[] = [];

    const flushPendingRemoved = () => {
      for (const line of pendingRemoved) {
        line.segments = allChangedSegments(line.content);
      }
      pendingRemoved.length = 0;
    };

    for (const line of lines) {
      if (line.startsWith('@@')) {
        flushPendingRemoved();
        const start = line.match(HUNK_START);
        if (start) {
          newLineNumber = Number.parseInt(start[1] ?? '1', 10);
          inHunk = true;
        }
        result.push({ type: 'hunk-header', content: line });
      } else if (line.startsWith('\\')) {
        flushPendingRemoved();
        result.push({ type: 'context', content: line });
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        const added: DiffLine = { type: 'added', content: line, lineNumber: inHunk ? newLineNumber : undefined };
        const removed = pendingRemoved.shift();
        if (removed) {
          const { removed: removedSegments, added: addedSegments } = diffWords(
            stripDiffMarker(removed.content),
            stripDiffMarker(added.content),
          );
          removed.segments = reattachMarker(removed.content, removedSegments);
          added.segments = reattachMarker(added.content, addedSegments);
          result.push(removed, added);
        } else {
          added.segments = allChangedSegments(added.content);
          result.push(added);
        }
        if (inHunk) newLineNumber++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        pendingRemoved.push({ type: 'removed', content: line });
      } else {
        flushPendingRemoved();
        result.push({ type: 'context', content: line, lineNumber: inHunk ? newLineNumber : undefined });
        if (inHunk) newLineNumber++;
      }
    }
    flushPendingRemoved();

    return result;
  });

  constructor() {
    effect(() => {
      const target = this.scrollToLine();
      const rendered = this.parsedLines().length > 0;
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

  lineClass(line: DiffLine): string {
    const flagged = this.flaggedLine(line) !== undefined;
    const expanded = this.expandedLine() === line.lineNumber;
    return [line.type, flagged ? 'flagged' : '', expanded ? 'expanded' : ''].filter(Boolean).join(' ');
  }

  /** The findings attached to a line, or undefined when the line is not flagged. */
  flaggedLine(line: DiffLine): DiffScanFinding[] | undefined {
    if (line.lineNumber === undefined) return undefined;
    const findings = this.findingsByLine().get(line.lineNumber);
    return findings && findings.length > 0 ? findings : undefined;
  }

  toggle(line: DiffLine): void {
    if (this.flaggedLine(line) === undefined || line.lineNumber === undefined) return;
    this.expandedLine.set(this.expandedLine() === line.lineNumber ? null : line.lineNumber);
  }
}

function allChangedSegments(content: string): WordSegment[] {
  return [{ text: content, changed: true }];
}

function stripDiffMarker(content: string): string {
  return content.slice(DIFF_MARKER_LENGTH);
}

function reattachMarker(content: string, segments: WordSegment[]): WordSegment[] {
  const marker = content.slice(0, DIFF_MARKER_LENGTH);
  if (segments.length === 0) return [{ text: marker, changed: false }];
  segments[0].text = marker + segments[0].text;
  return segments;
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'hunk-header';
  content: string;
  lineNumber?: number;
  segments?: WordSegment[];
}
