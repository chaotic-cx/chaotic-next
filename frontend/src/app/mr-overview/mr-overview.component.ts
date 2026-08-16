import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  type AurMaintainerChange,
  type AurMaintainerInfo,
  type DiffScanFinding,
  type DiffScanSeverity,
  MergeRequestWithDiffs,
  type VtIndicatorReport,
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
import { presenter } from '../aur-scan/scan-presenter';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { LazyViewportDirective } from '../directives/lazy-viewport.directive';
import { TitleComponent } from '../title/title.component';
import { MrOverviewService } from './mr-overview.service';

interface ScanSummary {
  tagSeverity: 'danger' | 'warn' | 'info';
  label: string;
  hasCritical: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

const NO_FOCUSED_PANEL = -1;
const FIRST_PANEL_INDEX = 0;
const AUR_UPDATES_TAB = '0';
const PACKAGE_UPDATES_TAB = '1';

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
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class MrOverviewComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly hostElement = inject(ElementRef).nativeElement as HTMLElement;

  protected readonly mrOverviewService = inject(MrOverviewService);

  private readonly authService = inject(AuthService);

  readonly isLoggedIn = this.authService.isLoggedIn;

  /** Index of the MR panel currently focused by j/k navigation, -1 when none. */
  protected readonly focusedIndex = signal(NO_FOCUSED_PANEL);

  /** Which tab the j/k navigation operates on: 0 = AUR updates, 1 = package updates. */
  protected readonly activeTabValue = signal<'0' | '1'>(AUR_UPDATES_TAB);

  protected readonly presenter = presenter;

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

  private readonly focusedMrs = computed<MergeRequestWithDiffs[]>(() =>
    this.activeTabValue() === AUR_UPDATES_TAB ? this.packageMrs() : this.nvcheckerMrs(),
  );

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'j' && event.key !== 'k' && event.key !== 'Enter' && event.key !== ' ') return;
    if (isEditableTarget(event.target)) return;

    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      if (this.focusedIndex() === NO_FOCUSED_PANEL) this.focusFirstMr();
      else this.moveFocus(event.key === 'j' ? 1 : -1);
      return;
    }

    // Enter/Space only toggle the focused MR's findings when the panel itself
    // has focus, so activating buttons or links inside it is never hijacked.
    if (event.target === this.focusedPanel(this.focusedIndex())) {
      this.toggleFocusedFindings();
      event.preventDefault();
    }
  }

  private focusFirstMr(): void {
    this.focusedIndex.set(FIRST_PANEL_INDEX);
    this.focusedPanel(FIRST_PANEL_INDEX)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.focusedPanel(FIRST_PANEL_INDEX)?.focus();
  }

  private moveFocus(delta: number): void {
    const count = this.focusedMrs().length;
    if (count === 0) return;
    const next = (this.focusedIndex() + delta + count) % count;
    this.focusedIndex.set(next);
    const panel = this.focusedPanel(next);
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    panel?.focus();
  }

  protected onTabChange(value: string | number | undefined): void {
    const tab = value === PACKAGE_UPDATES_TAB ? PACKAGE_UPDATES_TAB : AUR_UPDATES_TAB;
    this.activeTabValue.set(tab);
    this.focusedIndex.set(NO_FOCUSED_PANEL);
  }

  private focusedPanel(index: number): HTMLElement | null {
    const panels = this.hostElement.querySelectorAll<HTMLElement>('[data-mr-panel]');
    return panels[index] ?? null;
  }

  private toggleFocusedFindings(): void {
    const panel = this.focusedPanel(this.focusedIndex());
    if (!panel) return;
    const fieldset = panel.querySelector<HTMLElement>('[data-scan-fieldset]');
    fieldset?.click();
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

  protected scanFindings(mr: MergeRequestWithDiffs): DiffScanFinding[] {
    return mr.scanFindings ?? [];
  }

  protected vtReports(mr: MergeRequestWithDiffs): VtIndicatorReport[] {
    return mr.vtReports ?? [];
  }

  protected maintainers(mr: MergeRequestWithDiffs): AurMaintainerInfo[] {
    return mr.maintainers ?? [];
  }

  protected maintainerChange(mr: MergeRequestWithDiffs): AurMaintainerChange | null {
    return mr.maintainerChange ?? null;
  }

  protected scanSummary(mr: MergeRequestWithDiffs): ScanSummary | null {
    const findings = mr.scanFindings ?? [];
    if (findings.length === 0) return null;
    const worst = findings.reduce((a, b) => (this.severityOrder[a.severity] <= this.severityOrder[b.severity] ? a : b));
    const label = `${findings.length} scan finding${findings.length === 1 ? '' : 's'}`;
    return {
      tagSeverity: this.presenter.findingSeverity[worst.severity],
      label,
      hasCritical: worst.severity === 'critical',
    };
  }

  protected fileHasFindings(mr: MergeRequestWithDiffs, path: string): boolean {
    return (mr.scanFindings ?? []).some((finding) => finding.file === path);
  }

  protected findingsByLine(mr: MergeRequestWithDiffs, path: string): Map<number, DiffScanFinding[]> {
    const byLine = new Map<number, DiffScanFinding[]>();
    for (const finding of mr.scanFindings ?? []) {
      if (finding.file !== path || finding.line === undefined) continue;
      const findings = byLine.get(finding.line) ?? [];
      findings.push(finding);
      byLine.set(finding.line, findings);
    }
    return byLine;
  }

  protected stripPkgPrefix(mr: MergeRequestWithDiffs, path: string): string {
    return path.replace(`${mr.title}/`, '');
  }

  protected fileLocation(mr: MergeRequestWithDiffs, finding: DiffScanFinding): string {
    const path = this.stripPkgPrefix(mr, finding.file);
    return finding.line !== undefined ? `${path}:${finding.line}` : path;
  }
}
