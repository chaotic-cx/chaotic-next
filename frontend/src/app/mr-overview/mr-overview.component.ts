import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type AurMaintainerChange,
  type AurMaintainerInfo,
  type DiffScanFinding,
  type DiffScanSeverity,
  MergeRequestWithDiffs,
  type MrPackageInfo,
  PKGBUILD_SOURCE_AUR,
  type VtIndicatorReport,
} from '@chaotic-next/shared-lib';
import { Button } from '@openng/optimus-ui/button';
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

const TAB_QUERY_PARAMS: Record<'0' | '1', string> = {
  [AUR_UPDATES_TAB]: 'aur',
  [PACKAGE_UPDATES_TAB]: 'packages',
};

function tabFromQueryParam(value: string): '0' | '1' {
  return value === TAB_QUERY_PARAMS[PACKAGE_UPDATES_TAB] ? PACKAGE_UPDATES_TAB : AUR_UPDATES_TAB;
}

function parseNewMrIids(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(Number)
    .filter((iid) => Number.isInteger(iid) && iid > 0);
}

@Component({
  selector: 'chaotic-mr-overview',
  imports: [
    TitleComponent,
    TableModule,
    DiffRendererComponent,
    ProgressSpinner,
    Panel,
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly hostElement = inject(ElementRef).nativeElement as HTMLElement;

  protected readonly mrOverviewService = inject(MrOverviewService);

  private readonly authService = inject(AuthService);

  readonly isLoggedIn = this.authService.isLoggedIn;

  /** Index of the MR panel currently focused by j/k navigation, -1 when none. */
  protected readonly focusedIndex = signal(NO_FOCUSED_PANEL);

  /** Which tab the j/k navigation operates on: 0 = AUR updates, 1 = package updates. */
  protected readonly activeTabValue = signal<'0' | '1'>(AUR_UPDATES_TAB);

  protected readonly hasNewMr = signal(false);
  protected readonly presenter = presenter;
  private readonly newMrIidsToCheck = signal<number[]>([]);

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
        if (event.hasNewMr) this.hasNewMr.set(true);
        const currentMrs = untracked(this.mrOverviewService.mergeRequests);
        const updatedById = new Map(event.mr.map((mr) => [mr.id, mr]));
        const updatedMrs = currentMrs.map((currentMr) => {
          const updatedMr = updatedById.get(currentMr.id);
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

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const iids = parseNewMrIids(params.get('newMr'));
      if (iids.length === 0) return;
      this.newMrIidsToCheck.set(iids);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { newMr: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    effect(() => {
      const iids = this.newMrIidsToCheck();
      if (iids.length === 0) return;
      const visibleIids = new Set(this.mrOverviewService.mergeRequests().map((mr) => mr.iid));
      if (iids.some((iid) => !visibleIids.has(iid))) this.hasNewMr.set(true);
      this.newMrIidsToCheck.set([]);
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

  protected refreshMrs(): void {
    void this.mrOverviewService.loadOpenMrs();
  }

  protected onTabChange(value: string | number | undefined): void {
    const tab = value === PACKAGE_UPDATES_TAB ? PACKAGE_UPDATES_TAB : AUR_UPDATES_TAB;
    this.activeTabValue.set(tab);
    this.focusedIndex.set(NO_FOCUSED_PANEL);
    this.hasNewMr.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: TAB_QUERY_PARAMS[tab] },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
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
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam !== null) {
      this.activeTabValue.set(tabFromQueryParam(tabParam));
    }

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

  /** Display config for a review action button, shared by the mobile and desktop layouts. */
  protected actionButton(
    mr: MergeRequestWithDiffs,
    action: 'approve' | 'dangerous' | 'hold',
  ): { label: string; icon: string; severity: string; disabled: boolean; loading: boolean; tooltip: string } {
    switch (action) {
      case 'approve':
        return {
          label: mr.labels.includes('approved') ? 'Already approved' : 'Approve update',
          icon: 'pi pi-check',
          severity: 'success',
          disabled: this.actionsDisabled(mr),
          loading: this.isLoading(mr, 'approve'),
          tooltip: 'Approve this merge request for auto-merge',
        };
      case 'dangerous':
        return {
          label: mr.labels.includes('dangerous') ? 'Already flagged' : 'Flag as dangerous',
          icon: 'pi pi-exclamation-triangle',
          severity: 'danger',
          disabled: this.actionsDisabled(mr) || mr.labels.includes('hold'),
          loading: this.isLoading(mr, 'flag:dangerous'),
          tooltip: 'Flag this merge request as dangerous and prevent auto-merge',
        };
      case 'hold':
        return {
          label: mr.labels.includes('hold') ? 'Already on hold' : 'Hold for now',
          icon: 'pi pi-pause',
          severity: 'warn',
          disabled: this.actionsDisabled(mr) || mr.labels.includes('hold'),
          loading: this.isLoading(mr, 'flag:hold'),
          tooltip: 'Put this merge request on hold for later review',
        };
    }
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
    const label = `${findings.length} finding${findings.length === 1 ? '' : 's'}`;
    return {
      tagSeverity: this.presenter.findingSeverity[worst.severity],
      label,
      hasCritical: worst.severity === 'critical',
    };
  }

  private readonly findingsOpen = signal<ReadonlyMap<number, boolean>>(new Map());

  /** Whether the scan-findings card is expanded; defaults to open when a finding is critical. */
  protected isFindingsOpen(mr: MergeRequestWithDiffs): boolean {
    return this.findingsOpen().get(mr.iid) ?? this.scanSummary(mr)?.hasCritical ?? false;
  }

  protected toggleFindings(mr: MergeRequestWithDiffs): void {
    const next = new Map(this.findingsOpen());
    next.set(mr.iid, !this.isFindingsOpen(mr));
    this.findingsOpen.set(next);
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

  protected packageInfo(mr: MergeRequestWithDiffs): MrPackageInfo | null {
    return mr.packageInfo ?? null;
  }

  /** `.CI` files that signal a build override worth flagging (excludes the always-present `config`/`info`). */
  protected ciOverrideFiles(mr: MergeRequestWithDiffs): string[] {
    return (mr.packageInfo?.ciFiles ?? []).filter((file) => file !== 'config' && file !== 'info');
  }

  /** Whether the CI auto-pushes this package's AUR repo (`CI_MANAGE_AUR=true`). */
  protected isAurManaged(mr: MergeRequestWithDiffs): boolean {
    return mr.packageInfo?.manageAur === true;
  }

  /** Whether versions are auto-checked via nvchecker (`CI_NVCHECKER=true`). */
  protected isNvchecker(mr: MergeRequestWithDiffs): boolean {
    return mr.packageInfo?.nvchecker === true;
  }

  /** Packages that trigger a rebuild of this one when they change (`CI_REBUILD_TRIGGERS`). */
  protected rebuildTriggers(mr: MergeRequestWithDiffs): string[] {
    return mr.packageInfo?.rebuildTriggers ?? [];
  }

  protected ciFolderUrl(mr: MergeRequestWithDiffs): string {
    const pkgname = mr.packageInfo?.pkgname ?? this.mrOverviewService.extractPkgName(mr.title) ?? '';
    return `https://gitlab.com/chaotic-aur/pkgbuilds/-/tree/main/${pkgname}/.CI`;
  }

  protected packageLink(mr: MergeRequestWithDiffs): { label: string; url: string; tooltip: string } | null {
    const info = mr.packageInfo;
    if (!info) return null;
    const isCustom = info.pkgbuildSource !== '' && info.pkgbuildSource !== PKGBUILD_SOURCE_AUR;
    if (isCustom) {
      return {
        label: 'Custom',
        url: `https://gitlab.com/chaotic-aur/pkgbuilds/-/tree/main/${info.pkgname}`,
        tooltip: `PKGBUILD maintained in the pkgbuilds repo (${info.pkgbuildSource})`,
      };
    }
    return {
      label: 'AUR',
      url: `https://aur.archlinux.org/packages/${info.pkgname}`,
      tooltip: `Open the AUR page for ${info.pkgname}`,
    };
  }
}
