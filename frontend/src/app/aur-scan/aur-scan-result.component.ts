import { Component, computed, effect, inject, input } from '@angular/core';
import { type DiffScanFinding } from '@chaotic-next/shared-lib';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AurScanService } from './aur-scan.service';
import { presenter } from './scan-presenter';

const POPULARITY_DECIMALS = 2;

@Component({
  selector: 'chaotic-aur-scan-result',
  imports: [TagModule, Tooltip],
  templateUrl: './aur-scan-result.component.html',
})
export class AurScanResultComponent {
  private readonly scanService = inject(AurScanService);

  readonly packageName = input.required<string>();

  protected readonly scan = computed(() => this.scanService.scanOf(this.packageName()));
  protected readonly presenter = presenter;

  constructor() {
    effect(() => {
      const name = this.packageName();
      if (name) void this.scanService.startScan(name);
    });
  }

  protected flaggedVtCount(): number {
    return (this.scan()?.vtReports ?? []).filter(
      (report) => report.verdict === 'malicious' || report.verdict === 'suspicious',
    ).length;
  }

  protected hasNoviceMaintainer(): boolean {
    return (this.scan()?.maintainers ?? []).some((maintainer) => maintainer.novice);
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
}
