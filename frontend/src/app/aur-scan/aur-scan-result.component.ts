import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { vtIndicatorLink } from '../functions';
import { SourceViewerComponent } from '../source-viewer/source-viewer.component';
import { AurScanService } from './aur-scan.service';
import { presenter } from './scan-presenter';

const POPULARITY_DECIMALS = 2;

@Component({
  selector: 'chaotic-aur-scan-result',
  imports: [TagModule, Tooltip, SourceViewerComponent],
  templateUrl: './aur-scan-result.component.html',
})
export class AurScanResultComponent {
  private readonly scanService = inject(AurScanService);

  readonly STAGGER_CAP = 8;

  readonly packageName = input.required<string>();
  readonly showTitle = input(true);

  protected readonly scan = computed(() => this.scanService.scanOf(this.packageName()));
  protected readonly presenter = presenter;
  protected readonly collapsedFiles = signal<ReadonlySet<string>>(new Set<string>());

  /** Finding row the source viewer should reveal, if any. */
  protected readonly scrollTarget = signal<{ file: string; line: number } | null>(null);

  constructor() {
    effect(() => {
      const name = this.packageName();
      if (name) void this.scanService.startScan(name);
    });
  }

  protected scrollToFinding(finding: DiffScanFinding): void {
    this.collapsedFiles.update((collapsed) => {
      const next = new Set(collapsed);
      next.delete(finding.file);
      return next;
    });
    if (finding.line === undefined) return;
    this.scrollTarget.set({ file: finding.file, line: finding.line });
  }

  protected targetLineFor(fileName: string): number | null {
    const target = this.scrollTarget();
    return target?.file === fileName ? target.line : null;
  }

  protected clearScrollTarget(): void {
    this.scrollTarget.set(null);
  }

  protected isOpen(fileName: string): boolean {
    return !this.collapsedFiles().has(fileName);
  }

  protected toggleFile(fileName: string): void {
    this.collapsedFiles.update((collapsed) => {
      const next = new Set(collapsed);
      if (!next.delete(fileName)) next.add(fileName);
      return next;
    });
  }

  protected findingsByLine(fileName: string): Map<number, DiffScanFinding[]> {
    const byLine = new Map<number, DiffScanFinding[]>();
    for (const finding of this.scan()?.findings ?? []) {
      if (finding.file !== fileName || finding.line === undefined) continue;
      const findings = byLine.get(finding.line) ?? [];
      findings.push(finding);
      byLine.set(finding.line, findings);
    }
    return byLine;
  }

  protected flaggedVtCount(): number {
    return (this.scan()?.vtReports ?? []).filter(
      (report) => report.verdict === 'malicious' || report.verdict === 'suspicious',
    ).length;
  }

  protected scanDetails(): string {
    const current = this.scan();
    if (!current) return this.packageName();
    const meta = current.packageMeta;
    return `Sources: ${current.sources.length} · Scanned: ${current.scannedFiles.join(
      ', ',
    )} · Votes: ${meta.votes} · Popularity: ${meta.popularity.toFixed(
      POPULARITY_DECIMALS,
    )} · Since ${this.presenter.submissionYear(meta.firstSubmitted)}`;
  }

  protected fileLocation(finding: DiffScanFinding): string {
    return finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  }

  protected readonly vtLink = vtIndicatorLink;
}
