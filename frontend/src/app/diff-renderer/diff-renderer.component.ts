import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, input, output, signal } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { lineFlashKeyframes } from '../animations/line-flash';
import { prefersReducedMotion } from '../functions';
import { diffWords, type WordSegment } from './word-diff';

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_MARKER_LENGTH = 1;

const CHANGE_LABEL_KEYS: Partial<Record<DiffLineType, string>> = {
  added: marker('diffRenderer.added'),
  removed: marker('diffRenderer.removed'),
};

@Component({
  selector: 'chaotic-diff-renderer',
  imports: [NgTemplateOutlet, TranslocoDirective],
  templateUrl: './diff-renderer.component.html',
  styleUrl: './diff-renderer.component.css',
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

  protected changeLabelKey(line: DiffLine): string | undefined {
    return CHANGE_LABEL_KEYS[line.type];
  }

  readonly parsedLines = computed(() => {
    if (!this.diff()) return [];

    const result: DiffLine[] = [];
    let inHunk = false;
    let oldLineNumber = 0;
    let newLineNumber = 0;
    const pendingRemoved: DiffLine[] = [];

    const flushPendingRemoved = () => {
      for (const line of pendingRemoved) {
        line.segments = allChangedSegments(line.content);
      }
      pendingRemoved.length = 0;
    };

    for (const raw of this.diff().split('\n')) {
      if (raw.startsWith('@@')) {
        flushPendingRemoved();
        const start = raw.match(HUNK_START);
        if (start) {
          oldLineNumber = Number.parseInt(start[1] ?? '1', 10);
          newLineNumber = Number.parseInt(start[2] ?? '1', 10);
          inHunk = true;
        }
        result.push({ type: 'hunk-header', marker: '', content: raw });
      } else if (raw.startsWith('\\')) {
        flushPendingRemoved();
        result.push({ type: 'context', marker: '', content: raw });
      } else if (raw.startsWith('+') && !raw.startsWith('+++')) {
        const added: DiffLine = {
          type: 'added',
          marker: '+',
          content: stripDiffMarker(raw),
          lineNumber: inHunk ? newLineNumber : undefined,
        };
        const removed = pendingRemoved.shift();
        if (removed) {
          const words = diffWords(removed.content, added.content);
          removed.segments = words.removed;
          added.segments = words.added;
          result.push(removed, added);
        } else {
          added.segments = allChangedSegments(added.content);
          result.push(added);
        }
        if (inHunk) {
          newLineNumber++;
        }
      } else if (raw.startsWith('-') && !raw.startsWith('---')) {
        pendingRemoved.push({
          type: 'removed',
          marker: '-',
          content: stripDiffMarker(raw),
          oldLineNumber: inHunk ? oldLineNumber : undefined,
        });
        if (inHunk) {
          oldLineNumber++;
        }
      } else {
        flushPendingRemoved();
        result.push({
          type: 'context',
          marker: '',
          content: stripDiffMarker(raw),
          oldLineNumber: inHunk ? oldLineNumber : undefined,
          lineNumber: inHunk ? newLineNumber : undefined,
        });
        if (inHunk) {
          oldLineNumber++;
          newLineNumber++;
        }
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

    const reducedMotion = prefersReducedMotion();
    row.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    if (reducedMotion) return;

    // Start flashing once the smooth scroll has arrived.
    row.animate(lineFlashKeyframes(), { duration: 1500, delay: 400, easing: 'ease-out' });
  }

  lineClass(line: DiffLine): string {
    const flagged = this.flaggedLine(line) !== undefined;
    const expanded = this.expandedLine() === line.lineNumber;
    return ['diff-line', line.type, flagged ? 'flagged' : '', expanded ? 'expanded' : ''].filter(Boolean).join(' ');
  }

  /** The findings attached to a line, or undefined when the line is not flagged. */
  flaggedLine(line: DiffLine): DiffScanFinding[] | undefined {
    if (line.lineNumber === undefined) return undefined;
    const findings = this.findingsByLine().get(line.lineNumber);
    return findings && findings.length > 0 ? findings : undefined;
  }

  displaySegments(line: DiffLine): WordSegment[] {
    return line.segments ?? [{ text: line.content, changed: false }];
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

type DiffLineType = 'context' | 'added' | 'removed' | 'hunk-header';

interface DiffLine {
  type: DiffLineType;
  marker: string;
  content: string;
  oldLineNumber?: number;
  lineNumber?: number;
  segments?: WordSegment[];
}
