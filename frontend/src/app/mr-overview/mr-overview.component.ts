import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  type DiffScanFinding,
  type DiffScanSeverity,
  MergeRequestWithDiffs,
  totalEngines,
  type VtIndicatorReport,
  type VtVerdict,
} from '@chaotic-next/shared-lib';
import { Button } from '@openng/optimus-ui/button';
import { Fieldset } from '@openng/optimus-ui/fieldset';
import { Panel } from '@openng/optimus-ui/panel';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { TableModule } from '@openng/optimus-ui/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@openng/optimus-ui/tabs';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { LazyViewportDirective } from '../directives/lazy-viewport.directive';
import { TitleComponent } from '../title/title.component';
import { MrOverviewService } from './mr-overview.service';

interface ScanSummary {
  tagSeverity: 'danger' | 'warn' | 'info';
  label: string;
  hasCritical: boolean;
}

@Component({
  selector: 'chaotic-mr-overview',
  imports: [
    TitleComponent,
    TableModule,
    DiffRendererComponent,
    LazyViewportDirective,
    ProgressSpinner,
    Panel,
    Fieldset,
    Button,
    NgTemplateOutlet,
    Tooltip,
    RouterLink,
    TagModule,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
  ],
  templateUrl: './mr-overview.component.html',
  styleUrl: './mr-overview.component.css',
})
export class MrOverviewComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  protected readonly mrOverviewService = inject(MrOverviewService);

  private readonly authService = inject(AuthService);

  readonly isLoggedIn = this.authService.isLoggedIn;

  protected readonly nvcheckerMrs = computed(() =>
    this.mrOverviewService.mergeRequests().filter((mr) => mr.labels.includes('nvchecker')),
  );
  protected readonly packageMrs = computed(() =>
    this.mrOverviewService.mergeRequests().filter((mr) => !mr.labels.includes('nvchecker')),
  );

  constructor() {
    this.appService.chaoticEvent
      .pipe(
        filter((event) => event.type === 'merge_request'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const currentMrs = untracked(this.mrOverviewService.mergeRequests);
        const updatedMrs = currentMrs.map((currentMr) => {
          const updatedMr = event.mr.find((mr) => mr.id === currentMr.id);
          if (updatedMr) {
            return {
              ...currentMr,
              ...updatedMr,
              title: this.mrOverviewService.extractPkgName(updatedMr.title) || updatedMr.title,
              diffs: this.mrOverviewService.sortDiff(updatedMr.diffs),
            };
          }
          return currentMr;
        });

        this.mrOverviewService.mergeRequests.set(updatedMrs);
      });
  }

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Update review',
      description: 'Review and approve pending merge requests for Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR update review',
      url: this.router.url,
    });

    void this.mrOverviewService.loadOpenMrs();
  }

  isLoading(mr: MergeRequestWithDiffs, action: 'approve' | 'flag:dangerous' | 'flag:hold' | 'any'): boolean {
    const loadingMap = this.mrOverviewService.loadingMap();
    if (action === 'any') {
      return (
        loadingMap.get(`${mr.iid}:approve`) === true ||
        loadingMap.get(`${mr.iid}:flag:dangerous`) === true ||
        loadingMap.get(`${mr.iid}:flag:hold`) === true
      );
    }
    const key = `${mr.iid}:${action}`;
    return loadingMap.get(key) === true;
  }

  /** MRs flagged as malware or dangerous only proceed through manual review, never the buttons. */
  protected requiresManualReview(mr: MergeRequestWithDiffs): boolean {
    return mr.labels.includes('malware') || mr.labels.includes('dangerous');
  }

  /** Shared disabled state of all review action buttons; hold additionally blocks flag/hold. */
  protected actionsDisabled(mr: MergeRequestWithDiffs): boolean {
    return this.requiresManualReview(mr) || mr.labels.includes('approved') || this.isLoading(mr, 'any');
  }

  private readonly severityOrder: Record<DiffScanSeverity, number> = { critical: 0, warning: 1, info: 2 };
  protected readonly tagSeverity: Record<DiffScanSeverity, 'danger' | 'warn' | 'info'> = {
    critical: 'danger',
    warning: 'warn',
    info: 'info',
  };

  protected readonly vtTagSeverity: Record<VtVerdict, 'danger' | 'warn' | 'success' | 'info'> = {
    malicious: 'danger',
    suspicious: 'warn',
    clean: 'success',
    unknown: 'info',
  };

  protected vtEngines(report: VtIndicatorReport): string {
    if (!report.stats) return 'no engine data';
    const flagged = report.stats.malicious + report.stats.suspicious;
    return `${flagged}/${totalEngines(report.stats)} engines flagged`;
  }

  protected scanFindings(mr: MergeRequestWithDiffs): DiffScanFinding[] {
    return mr.scanFindings ?? [];
  }

  protected vtReports(mr: MergeRequestWithDiffs): VtIndicatorReport[] {
    return mr.vtReports ?? [];
  }

  protected scanSummary(mr: MergeRequestWithDiffs): ScanSummary | null {
    const findings = mr.scanFindings ?? [];
    if (findings.length === 0) return null;
    const worst = findings.reduce((a, b) => (this.severityOrder[a.severity] <= this.severityOrder[b.severity] ? a : b));
    const label = `${findings.length} scan finding${findings.length === 1 ? '' : 's'}`;
    return { tagSeverity: this.tagSeverity[worst.severity], label, hasCritical: worst.severity === 'critical' };
  }

  protected fileHasFindings(mr: MergeRequestWithDiffs, path: string): boolean {
    return (mr.scanFindings ?? []).some((finding) => finding.file === path);
  }

  protected findingLines(mr: MergeRequestWithDiffs, path: string): Set<number> {
    const lines = new Set<number>();
    for (const finding of mr.scanFindings ?? []) {
      if (finding.file === path && finding.line !== undefined) lines.add(finding.line);
    }
    return lines;
  }

  protected stripPkgPrefix(mr: MergeRequestWithDiffs, path: string): string {
    return path.replace(`${mr.title}/`, '');
  }

  protected fileLocation(mr: MergeRequestWithDiffs, finding: DiffScanFinding): string {
    const path = this.stripPkgPrefix(mr, finding.file);
    return finding.line !== undefined ? `${path}:${finding.line}` : path;
  }
}
