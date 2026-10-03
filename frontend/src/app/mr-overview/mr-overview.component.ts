import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type AurMaintainerChange,
  type AurMaintainerInfo,
  type DiffScanFinding,
  type DiffScanSeverity,
  FLAG_REASON_MAX_LENGTH,
  MergeRequestWithDiffs,
  type MrPackageInfo,
  PKGBUILD_SOURCE_AUR,
  type VtIndicatorReport,
} from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Button } from '@openng/optimus-ui/button';
import type { ButtonSeverity } from '@openng/optimus-ui/types/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Panel } from '@openng/optimus-ui/panel';
import { TableModule } from '@openng/optimus-ui/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@openng/optimus-ui/tabs';
import { TagModule } from '@openng/optimus-ui/tag';
import { Textarea } from '@openng/optimus-ui/textarea';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { preferredScrollBehavior, setPageSeo } from '../functions';
import { ScanFindingRowComponent } from '../aur-scan/scan-finding-row.component';
import { presenter, type TranslatableText } from '../aur-scan/scan-presenter';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { injectActiveTranslation } from '../i18n/active-translation';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { TitleComponent } from '../title/title.component';
import { MrOverviewService } from './mr-overview.service';

interface ScanSummary {
  tagSeverity: 'danger' | 'warn' | 'info';
  label: TranslatableText;
}

interface ActionButton {
  labelKey: string;
  tooltipKey: string;
  severity: ButtonSeverity;
  disabled: boolean;
  loading: boolean;
}

interface PackageLink {
  isCustom: boolean;
  url: string;
  tooltip: TranslatableText;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

const NO_FOCUSED_PANEL = -1;
const FIRST_PANEL_INDEX = 0;
const AUR_UPDATES_TAB = '0';
const PACKAGE_UPDATES_TAB = '1';
const ON_HOLD_TAB = '2';
const HIGHLIGHT_RENDER_DELAY_MS = 100;
const FLASH_DURATION_MS = 1800;

const TAB_QUERY_PARAMS: Record<'0' | '1' | '2', string> = {
  [AUR_UPDATES_TAB]: 'aur',
  [PACKAGE_UPDATES_TAB]: 'packages',
  [ON_HOLD_TAB]: 'hold',
};

function tabFromQueryParam(value: string): '0' | '1' | '2' {
  if (value === TAB_QUERY_PARAMS[PACKAGE_UPDATES_TAB]) return PACKAGE_UPDATES_TAB;
  if (value === TAB_QUERY_PARAMS[ON_HOLD_TAB]) return ON_HOLD_TAB;
  return AUR_UPDATES_TAB;
}

function parseNewMrIids(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(Number)
    .filter((iid) => Number.isInteger(iid) && iid > 0);
}

/**
 * One step of the notification deep-link flow: judge one batch of linked MRs
 * against freshly loaded backend data. The dot only turns on when a linked MR
 * actually exists in the open list; missing ones never produce it. A failed
 * load decides nothing (`dot: null`) so stale data cannot flip the dot.
 */
export function newMrChipDecision(
  batchIids: number[],
  loadSucceeded: boolean,
  renderedIids: ReadonlySet<number>,
): { dot: boolean | null; highlightIid: number | null } {
  if (!loadSucceeded || batchIids.length === 0) return { dot: null, highlightIid: null };
  const present = batchIids.filter((iid) => renderedIids.has(iid));
  return { dot: present.length > 0, highlightIid: present[0] ?? null };
}

type MrAction = 'approve' | 'dangerous' | 'hold';

const SKELETON_PANEL_COUNT = 2;

const MR_ACTIONS: readonly MrAction[] = ['approve', 'dangerous', 'hold'];

const MR_ACTION_STYLE_CLASSES: Record<MrAction, string> = {
  approve: 'mr-btn-approve',
  dangerous: 'mr-btn-danger',
  hold: 'mr-btn-warn',
};

@Component({
  selector: 'chaotic-mr-overview',
  imports: [
    TitleComponent,
    TableModule,
    DiffRendererComponent,
    ScanFindingRowComponent,
    LoadErrorComponent,
    Panel,
    Button,
    DatePipe,
    Dialog,
    FormsModule,
    NgTemplateOutlet,
    Textarea,
    Tooltip,
    RouterLink,
    TagModule,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    TranslocoDirective,
  ],
  templateUrl: './mr-overview.component.html',
  styleUrl: './mr-overview.component.css',
  host: {
    '(keydown)': 'onKeydown($event)',
  },
})
export class MrOverviewComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly hostElement = inject(ElementRef).nativeElement as HTMLElement;
  private readonly transloco = inject(TranslocoService);
  protected readonly mrOverviewService = inject(MrOverviewService);

  private readonly activeTranslation = injectActiveTranslation();

  // Finding row a diff renderer should reveal, if any.
  private readonly diffScrollTarget = signal<{ iid: number; path: string; line: number } | null>(null);

  readonly isLoggedIn = this.authService.isLoggedIn;

  /** Index of the MR panel currently focused by j/k navigation, -1 when none. */
  protected readonly focusedIndex = signal(NO_FOCUSED_PANEL);

  /** Which tab the j/k navigation operates on: 0 = AUR, 1 = package updates, 2 = on hold. */
  protected readonly activeTabValue = signal<'0' | '1' | '2'>(AUR_UPDATES_TAB);

  /** Pending flag dialog: which MR and label the reason is collected for. */
  protected readonly flagDialog = signal<{ mr: MergeRequestWithDiffs; label: 'dangerous' | 'hold' } | null>(null);
  protected readonly flagReason = signal('');
  protected readonly flagReasonMaxLength = FLAG_REASON_MAX_LENGTH;

  protected readonly hasNewMr = signal(false);
  protected readonly presenter = presenter;
  private readonly pendingNewMrIids = signal<number[]>([]);
  private evaluatingNewMrs = false;

  protected readonly nvcheckerMrs = computed(() =>
    this.mrOverviewService
      .mergeRequests()
      .filter((mr) => mr.labels.includes('nvchecker') && !mr.labels.includes('hold')),
  );
  protected readonly packageMrs = computed(() =>
    this.mrOverviewService
      .mergeRequests()
      .filter((mr) => !mr.labels.includes('nvchecker') && !mr.labels.includes('hold')),
  );
  protected readonly holdMrs = computed(() =>
    this.mrOverviewService.mergeRequests().filter((mr) => mr.labels.includes('hold')),
  );

  constructor() {
    setPageSeo(
      this.transloco.translate('reviewQueue.seo.title'),
      this.transloco.translate('reviewQueue.seo.description'),
      this.transloco.translate('reviewQueue.seo.keywords'),
    );
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
          if (updatedMr === undefined) return currentMr;
          return {
            ...currentMr,
            ...updatedMr,
            title: this.mrOverviewService.extractPkgName(updatedMr.title) || updatedMr.title,
            diffs: updatedMr.diffs ? this.mrOverviewService.sortDiff(updatedMr.diffs) : currentMr.diffs,
          };
        });

        this.mrOverviewService.mergeRequests.set(updatedMrs);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const iids = parseNewMrIids(params.get('newMr'));
      if (iids.length === 0) return;
      this.pendingNewMrIids.update((pending) => [...new Set([...pending, ...iids])]);
      void this.router
        .navigate([], {
          relativeTo: this.route,
          queryParams: { newMr: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        })
        .then(() => this.evaluatePendingNewMrs());
    });
  }

  /**
   * Decides the new-MR dot from freshly loaded backend data only: the dot
   * appears when a linked MR is part of the open list, and stays off when the
   * MR no longer exists. Failed loads keep the pending iids for the next try.
   */
  private async evaluatePendingNewMrs(): Promise<void> {
    if (this.evaluatingNewMrs) return;
    this.evaluatingNewMrs = true;
    try {
      while (untracked(this.pendingNewMrIids).length > 0) {
        const iids = untracked(this.pendingNewMrIids);
        const loaded = await this.mrOverviewService.loadOpenMrs();
        const rendered = new Set(untracked(this.mrOverviewService.mergeRequests).map((mr) => mr.iid));
        const decision = newMrChipDecision(iids, loaded, rendered);
        if (decision.dot !== null) this.hasNewMr.set(decision.dot);
        if (decision.highlightIid !== null) this.highlightLinkedMr(decision.highlightIid);
        if (!loaded) return;
        this.pendingNewMrIids.update((pending) => pending.filter((iid) => !iids.includes(iid)));
      }
    } finally {
      this.evaluatingNewMrs = false;
    }
  }

  private highlightLinkedMr(iid: number): void {
    const mr = untracked(this.mrOverviewService.mergeRequests).find((candidate) => candidate.iid === iid);
    if (!mr) return;
    if (mr.labels.includes('hold')) this.activeTabValue.set(ON_HOLD_TAB);
    else this.activeTabValue.set(mr.labels.includes('nvchecker') ? PACKAGE_UPDATES_TAB : AUR_UPDATES_TAB);

    // Let Angular render the freshly loaded list before touching the DOM.
    window.setTimeout(() => this.flashMrPanel(iid), HIGHLIGHT_RENDER_DELAY_MS);
  }

  private flashMrPanel(iid: number): void {
    const panel = this.hostElement.querySelector<HTMLElement>(`[data-mr-panel][data-mr-iid="${iid}"]`);
    if (!panel) return;
    panel.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
    panel.classList.add('new-mr-flash');
    window.setTimeout(() => panel.classList.remove('new-mr-flash'), FLASH_DURATION_MS);
  }

  private readonly focusedMrs = computed<MergeRequestWithDiffs[]>(() => {
    const tab = this.activeTabValue();
    if (tab === ON_HOLD_TAB) return this.holdMrs();
    return tab === AUR_UPDATES_TAB ? this.packageMrs() : this.nvcheckerMrs();
  });

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'j' && event.key !== 'k') return;
    if (isEditableTarget(event.target)) return;

    event.preventDefault();
    if (this.focusedIndex() === NO_FOCUSED_PANEL) this.focusFirstMr();
    else this.moveFocus(event.key === 'j' ? 1 : -1);
  }

  private focusFirstMr(): void {
    this.focusedIndex.set(FIRST_PANEL_INDEX);
    this.focusedPanel(FIRST_PANEL_INDEX)?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' });
    this.focusedPanel(FIRST_PANEL_INDEX)?.focus();
  }

  private moveFocus(delta: number): void {
    const count = this.focusedMrs().length;
    if (count === 0) return;
    const next = (this.focusedIndex() + delta + count) % count;
    this.focusedIndex.set(next);
    const panel = this.focusedPanel(next);
    panel?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' });
    panel?.focus();
  }

  protected async refreshMrs(): Promise<void> {
    if (untracked(this.pendingNewMrIids).length > 0) {
      await this.evaluatePendingNewMrs();
      return;
    }

    // Everything the backend offers is now rendered, so an arrival hint is obsolete.
    await this.mrOverviewService.loadOpenMrs();
    this.hasNewMr.set(false);
  }

  protected onTabChange(value: string | number | undefined): void {
    const tab =
      value === PACKAGE_UPDATES_TAB ? PACKAGE_UPDATES_TAB : value === ON_HOLD_TAB ? ON_HOLD_TAB : AUR_UPDATES_TAB;
    this.activeTabValue.set(tab);
    this.focusedIndex.set(NO_FOCUSED_PANEL);
    this.hasNewMr.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: TAB_QUERY_PARAMS[tab] },
      queryParamsHandling: 'merge',
    });
  }

  protected panelTabIndex(index: number): number {
    const focused = this.focusedIndex();
    const isTabStop = focused === index || (focused === NO_FOCUSED_PANEL && index === FIRST_PANEL_INDEX);
    return isTabStop ? 0 : -1;
  }

  private focusedPanel(index: number): HTMLElement | null {
    const panels = this.hostElement.querySelectorAll<HTMLElement>('[data-mr-panel]');
    return panels[index] ?? null;
  }

  ngOnInit() {
    const tabParam = this.route.snapshot.queryParamMap.get('tab');
    if (tabParam !== null) {
      this.activeTabValue.set(tabFromQueryParam(tabParam));
    }

    void this.mrOverviewService.loadOpenMrs();
  }

  protected openFlagDialog(mr: MergeRequestWithDiffs, label: 'dangerous' | 'hold'): void {
    if (this.actionsDisabled(mr)) return;
    if (mr.labels.includes(label)) return;
    this.flagReason.set(mr.flagReason?.action === label ? mr.flagReason.text : '');
    this.flagDialog.set({ mr, label });
  }

  protected closeFlagDialog(): void {
    this.flagDialog.set(null);
    this.flagReason.set('');
  }

  protected editFlagReason(mr: MergeRequestWithDiffs): void {
    const reason = mr.flagReason;
    if (!reason || this.isLoading(mr, 'any')) return;
    this.flagReason.set(reason.text);
    this.flagDialog.set({ mr, label: reason.action });
  }

  protected readonly flagDialogTitle = computed(() => {
    this.activeTranslation();

    const pending = this.flagDialog();
    if (!pending) {
      return '';
    }

    const params = { iid: pending.mr.iid };
    if (pending.label === 'dangerous') {
      return this.transloco.translate('reviewQueue.flagDialog.titleDangerous', params);
    }

    return this.transloco.translate('reviewQueue.flagDialog.titleHold', params);
  });

  protected flagReasonValid(): boolean {
    return this.flagReason().trim().length > 0;
  }

  protected async confirmFlag(): Promise<void> {
    const pending = this.flagDialog();
    if (!pending || !this.flagReasonValid()) return;
    const ok = await this.mrOverviewService.flag(pending.mr, pending.label, this.flagReason().trim());
    if (ok) this.closeFlagDialog();
  }

  protected flagReasonLine(mr: MergeRequestWithDiffs): TranslatableText | null {
    const reason = mr.flagReason;
    if (!reason) {
      return null;
    }

    if (reason.userName) {
      return {
        key: marker('reviewQueue.flagReason.withAuthor'),
        params: { text: reason.text, author: reason.userName },
      };
    }

    return { key: marker('reviewQueue.flagReason.withoutAuthor'), params: { text: reason.text } };
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

  /** Shared disabled state of all review action buttons; hold additionally blocks hold. */
  protected actionsDisabled(mr: MergeRequestWithDiffs): boolean {
    return mr.labels.includes('approved') || this.isLoading(mr, 'any');
  }

  /** Display config for a review action button, shared by the mobile and desktop layouts. */
  protected readonly actionStyleClass = MR_ACTION_STYLE_CLASSES;
  protected readonly skeletonPanels = Array.from({ length: SKELETON_PANEL_COUNT });

  protected visibleActions(hideHold: boolean, hideDangerous: boolean): MrAction[] {
    return MR_ACTIONS.filter(
      (action) => !(action === 'hold' && hideHold) && !(action === 'dangerous' && hideDangerous),
    );
  }

  protected runAction(mr: MergeRequestWithDiffs, action: MrAction): void {
    if (action === 'approve') {
      void this.mrOverviewService.approve(mr);
      return;
    }
    this.openFlagDialog(mr, action);
  }

  protected actionButton(mr: MergeRequestWithDiffs, action: MrAction): ActionButton {
    switch (action) {
      case 'approve':
        return {
          labelKey: mr.labels.includes('approved')
            ? marker('reviewQueue.actions.approve.done')
            : marker('reviewQueue.actions.approve.label'),
          severity: 'success',
          disabled: this.actionsDisabled(mr),
          loading: this.isLoading(mr, 'approve'),
          tooltipKey: marker('reviewQueue.actions.approve.tooltip'),
        };
      case 'dangerous':
        return {
          labelKey: mr.labels.includes('dangerous')
            ? marker('reviewQueue.actions.dangerous.done')
            : marker('reviewQueue.actions.dangerous.label'),
          severity: 'danger',
          disabled: this.actionsDisabled(mr),
          loading: this.isLoading(mr, 'flag:dangerous'),
          tooltipKey: marker('reviewQueue.actions.dangerous.tooltip'),
        };
      case 'hold':
        return {
          labelKey: mr.labels.includes('hold')
            ? marker('reviewQueue.actions.hold.done')
            : marker('reviewQueue.actions.hold.label'),
          severity: 'warn',
          disabled: this.actionsDisabled(mr) || mr.labels.includes('hold'),
          loading: this.isLoading(mr, 'flag:hold'),
          tooltipKey: marker('reviewQueue.actions.hold.tooltip'),
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

    return {
      tagSeverity: this.presenter.findingSeverity[worst.severity],
      label: this.presenter.findingCount(findings.length),
    };
  }

  protected hasScanDetails(mr: MergeRequestWithDiffs): boolean {
    return (
      this.scanFindings(mr).length > 0 ||
      this.vtReports(mr).length > 0 ||
      this.maintainers(mr).length > 0 ||
      this.maintainerChange(mr) !== null
    );
  }

  protected scrollToFinding(mr: MergeRequestWithDiffs, finding: DiffScanFinding): void {
    // The finding cards live above the diffs; jump to the file section first
    // so the deferred diff renderer mounts, then it reveals the exact line.
    this.diffScrollTarget.set({ iid: mr.iid, path: finding.file, line: finding.line ?? -1 });
    const sectionId = this.diffSectionId(mr.iid, finding.file);
    this.hostElement.querySelector(`[data-diff-section="${sectionId}"]`)?.scrollIntoView({
      behavior: preferredScrollBehavior(),
      block: 'start',
    });
  }

  protected targetLineFor(mr: MergeRequestWithDiffs, path: string): number | null {
    const target = this.diffScrollTarget();
    return target && target.iid === mr.iid && target.path === path ? target.line : null;
  }

  protected clearDiffScroll(): void {
    this.diffScrollTarget.set(null);
  }

  protected diffSectionId(iid: number, path: string): string {
    return `${iid}|${path}`;
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

  protected packageLink(mr: MergeRequestWithDiffs): PackageLink | null {
    const info = mr.packageInfo;
    if (!info) {
      return null;
    }

    const isCustom = info.pkgbuildSource !== '' && info.pkgbuildSource !== PKGBUILD_SOURCE_AUR;
    if (isCustom) {
      return {
        isCustom,
        url: `https://gitlab.com/chaotic-aur/pkgbuilds/-/tree/main/${info.pkgname}`,
        tooltip: { key: marker('reviewQueue.packageLink.customTooltip'), params: { source: info.pkgbuildSource } },
      };
    }

    return {
      isCustom,
      url: `https://aur.archlinux.org/packages/${info.pkgname}`,
      tooltip: { key: marker('reviewQueue.packageLink.aurTooltip'), params: { pkgname: info.pkgname } },
    };
  }
}
