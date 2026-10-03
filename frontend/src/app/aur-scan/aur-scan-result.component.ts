import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { vtIndicatorLink } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { SourceViewerComponent } from '../source-viewer/source-viewer.component';
import { ScanFindingRowComponent } from './scan-finding-row.component';
import { AurScanService } from './aur-scan.service';
import { presenter } from './scan-presenter';

const POPULARITY_DECIMALS = 2;

@Component({
  selector: 'chaotic-aur-scan-result',
  imports: [TagModule, Tooltip, SourceViewerComponent, ScanFindingRowComponent, TranslocoDirective],
  templateUrl: './aur-scan-result.component.html',
  styleUrl: './aur-scan-result.component.css',
})
export class AurScanResultComponent {
  private readonly scanService = inject(AurScanService);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  readonly packageName = input.required<string>();
  readonly showTitle = input(true);

  protected readonly scan = computed(() => this.scanService.scanOf(this.packageName()));
  protected readonly presenter = presenter;
  protected readonly collapsedFiles = signal<ReadonlySet<string>>(new Set<string>());

  // Finding row the source viewer should reveal, if any.
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

  protected readonly findingsSeverity = computed(() => {
    const findings = this.scan()?.findings ?? [];
    if (findings.some((finding) => finding.severity === 'critical')) return 'danger';
    if (findings.some((finding) => finding.severity === 'warning')) return 'warn';
    return 'info';
  });

  protected flaggedVtCount(): number {
    return (this.scan()?.vtReports ?? []).filter(
      (report) => report.verdict === 'malicious' || report.verdict === 'suspicious',
    ).length;
  }

  protected readonly scanDetails = computed(() => {
    this.activeTranslation();

    const current = this.scan();
    if (!current) {
      return this.packageName();
    }

    const meta = current.packageMeta;

    return this.transloco.translate('aurScan.details', {
      sources: current.sources.length,
      scanned: current.scannedFiles.join(', '),
      votes: meta.votes,
      popularity: meta.popularity.toFixed(POPULARITY_DECIMALS),
      year: this.presenter.submissionYear(meta.firstSubmitted),
    });
  });

  protected fileLocation(finding: DiffScanFinding): string {
    return finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  }

  protected readonly vtLink = vtIndicatorLink;
}
