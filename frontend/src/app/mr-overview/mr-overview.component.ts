import { DatePipe, Location, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { MenuItem } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import type { ButtonSeverity } from '@openng/optimus-ui/types/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Menu } from '@openng/optimus-ui/menu';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Textarea } from '@openng/optimus-ui/textarea';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { isMobileSignal, preferredScrollBehavior, prefersReducedMotion, setPageSeo } from '../functions';
import { ScanFindingRowComponent } from '../aur-scan/scan-finding-row.component';
import { presenter, type TranslatableText } from '../aur-scan/scan-presenter';
import { DiffRendererComponent } from '../diff-renderer/diff-renderer.component';
import { FillViewportDirective } from '../fill-viewport.directive';
import { injectActiveTranslation } from '../i18n/active-translation';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { TitleComponent } from '../title/title.component';
import { MrOverviewService } from './mr-overview.service';

type RowTone = 'hold' | 'danger' | 'warn' | 'info' | 'success';

interface QueueGroup {
  key: 'aur' | 'packages' | 'hold';
  labelKey: string;
  mrs: MergeRequestWithDiffs[];
}

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

const FIRST_INDEX = 0;
const FLASH_CLASS = 'new-mr-flash';

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

const SKELETON_ROW_COUNT = 6;

// Diffs that render in the same frame as an MR switch, so the first screen shows no placeholder.
const EAGER_DIFF_COUNT = 3;

const MR_ACTIONS: readonly MrAction[] = ['approve', 'dangerous', 'hold'];

const MR_MENU_ITEM_CLASSES: Record<Exclude<MrAction, 'approve'>, string> = {
  dangerous: 'mr-menu-danger',
  hold: 'mr-menu-warn',
};

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
    FillViewportDirective,
    ScanFindingRowComponent,
    LoadErrorComponent,
    Button,
    DatePipe,
    Dialog,
    Menu,
    FormsModule,
    NgTemplateOutlet,
    Textarea,
    Tooltip,
    RouterLink,
    TagModule,
    TranslocoDirective,
  ],
  templateUrl: './mr-overview.component.html',
  styleUrls: [
    './mr-overview.component.css',
    './mr-overview-list.css',
    './mr-overview-detail.css',
    './mr-overview-actions.css',
  ],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class MrOverviewComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly hostElement = inject(ElementRef).nativeElement as HTMLElement;
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  protected readonly mrOverviewService = inject(MrOverviewService);

  private readonly activeTranslation = injectActiveTranslation();

  // Finding row a diff renderer should reveal, if any.
  private readonly diffScrollTarget = signal<{ iid: number; path: string; line: number } | null>(null);

  readonly isLoggedIn = this.authService.isLoggedIn;

  protected readonly isMobile = isMobileSignal();
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  private readonly selectedIid = computed(() => {
    const iid = Number(this.queryParams().get('mr'));
    return Number.isInteger(iid) && iid > 0 ? iid : null;
  });

  // Fallback index when the selected MR leaves the list.
  private readonly lastSelectedIndex = signal(FIRST_INDEX);

  // Whether this page pushed the phone detail onto history, so back can pop it.
  private detailPushedToHistory = false;

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
        if (event.hasNewMr) {
          this.hasNewMr.set(true);
        }
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
        if (decision.dot !== null) {
          this.hasNewMr.set(decision.dot);
        }
        if (decision.highlightIid !== null) {
          this.highlightLinkedMr(decision.highlightIid);
        }
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

    this.selectMr(mr);

    // Let Angular render the freshly loaded list before touching the DOM.
    afterNextRender(() => this.flashMrRow(iid), { injector: this.injector });
  }

  private flashMrRow(iid: number): void {
    const row = this.listRow(iid);
    if (!row) return;
    row.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' });
    // Reduced motion runs no animation, so no animationend event would remove the class.
    if (prefersReducedMotion()) return;

    // animationend bubbles, so an animation inside the row must not end the flash early.
    const removeFlash = (event: AnimationEvent): void => {
      if (event.target !== row) return;

      row.classList.remove(FLASH_CLASS);
      row.removeEventListener('animationend', removeFlash);
    };

    row.classList.add(FLASH_CLASS);
    row.addEventListener('animationend', removeFlash);
  }

  protected readonly queueGroups = computed<QueueGroup[]>(() => {
    const groups: QueueGroup[] = [
      { key: 'aur', labelKey: marker('reviewQueue.groups.aur'), mrs: this.packageMrs() },
      { key: 'packages', labelKey: marker('reviewQueue.groups.packages'), mrs: this.nvcheckerMrs() },
      { key: 'hold', labelKey: marker('reviewQueue.onHold'), mrs: this.holdMrs() },
    ];
    return groups.filter((group) => group.mrs.length > 0);
  });

  protected readonly queueMrs = computed<MergeRequestWithDiffs[]>(() =>
    this.queueGroups().flatMap((group) => group.mrs),
  );

  // Wide screens always show one MR; phones show the list until one is opened.
  protected readonly selectedMr = computed<MergeRequestWithDiffs | null>(() => {
    const mrs = this.queueMrs();
    const selected = mrs.find((mr) => mr.iid === this.selectedIid());
    if (selected) return selected;
    if (this.isMobile() || mrs.length === 0) return null;

    const fallbackIndex = Math.min(this.lastSelectedIndex(), mrs.length - 1);
    return mrs[fallbackIndex] ?? null;
  });

  // A one-item list, so each MR gets a fresh detail view.
  protected readonly selectedMrList = computed(() => {
    const mr = this.selectedMr();
    return mr ? [mr] : [];
  });

  protected readonly detailOpen = computed(() => this.isMobile() && this.selectedMr() !== null);

  // On phones, opening from the list pushes a history entry so back returns to the list; stepping replaces it.
  protected selectMr(mr: MergeRequestWithDiffs, stepping = false): void {
    this.lastSelectedIndex.set(Math.max(FIRST_INDEX, this.queueMrs().indexOf(mr)));
    const opensDetailView = this.isMobile() && !stepping;
    if (opensDetailView) {
      this.detailPushedToHistory = true;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mr: mr.iid },
      queryParamsHandling: 'merge',
      replaceUrl: !opensDetailView,
      scroll: 'manual',
    });

    afterNextRender(() => this.revealDetail(), { injector: this.injector });
  }

  protected closeDetail(): void {
    if (this.detailPushedToHistory) {
      this.detailPushedToHistory = false;
      this.location.back();
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mr: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private revealDetail(): void {
    const detail = this.hostElement.querySelector<HTMLElement>('.mr-detail');
    if (!detail || detail.getBoundingClientRect().top >= 0) return;
    detail.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'j' && event.key !== 'k') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    event.preventDefault();
    this.moveSelection(event.key === 'j' ? 1 : -1);
  }

  private moveSelection(delta: number): void {
    const next = this.stepMr(delta);
    if (!next) return;
    afterNextRender(() => this.listRow(next.iid)?.focus(), { injector: this.injector });
  }

  // Wraps around at both ends.
  protected stepMr(delta: number): MergeRequestWithDiffs | null {
    const mrs = this.queueMrs();
    if (mrs.length === 0) return null;

    const current = this.selectedMr();
    const currentIndex = current ? mrs.indexOf(current) : FIRST_INDEX - delta;
    const next = mrs[(currentIndex + delta + mrs.length) % mrs.length];
    if (!next) return null;

    this.selectMr(next, true);
    return next;
  }

  private readonly moreMenuTarget = signal<{ mr: MergeRequestWithDiffs; actions: MrAction[] } | null>(null);

  protected readonly moreMenuItems = computed<MenuItem[]>(() => {
    this.activeTranslation();
    const target = this.moreMenuTarget();
    if (!target) return [];

    const items: MenuItem[] = [];
    for (const action of target.actions) {
      if (action === 'approve') continue;
      const button = this.actionButton(target.mr, action);
      items.push({
        label: this.transloco.translate(button.labelKey),
        disabled: button.disabled,
        styleClass: MR_MENU_ITEM_CLASSES[action],
        command: () => this.runAction(target.mr, action),
      });
    }

    return items;
  });

  protected openMoreMenu(menu: Menu, event: Event, mr: MergeRequestWithDiffs, actions: MrAction[]): void {
    this.moreMenuTarget.set({ mr, actions });
    menu.toggle(event);
  }

  private listRow(iid: number): HTMLElement | null {
    return this.hostElement.querySelector<HTMLElement>(`[data-mr-row][data-mr-iid="${iid}"]`);
  }

  protected rowTone(mr: MergeRequestWithDiffs): RowTone {
    if (mr.labels.includes('hold')) return 'hold';
    return this.scanSummary(mr)?.tagSeverity ?? 'success';
  }

  protected scanNeedsReview(mr: MergeRequestWithDiffs): boolean {
    return this.scanFindings(mr).length > 0 || this.maintainerChange(mr) !== null;
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

  ngOnInit() {
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
    if (!pending) return '';

    const params = { iid: pending.mr.iid };
    if (pending.label === 'dangerous') return this.transloco.translate('reviewQueue.flagDialog.titleDangerous', params);

    return this.transloco.translate('reviewQueue.flagDialog.titleHold', params);
  });

  protected flagReasonValid(): boolean {
    return this.flagReason().trim().length > 0;
  }

  protected async confirmFlag(): Promise<void> {
    const pending = this.flagDialog();
    if (!pending || !this.flagReasonValid()) return;
    const ok = await this.mrOverviewService.flag(pending.mr, pending.label, this.flagReason().trim());
    if (ok) {
      this.closeFlagDialog();
    }
  }

  protected flagReasonLine(mr: MergeRequestWithDiffs): TranslatableText | null {
    const reason = mr.flagReason;
    if (!reason) return null;

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
  protected readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });
  protected readonly eagerDiffCount = EAGER_DIFF_COUNT;

  protected actionsFor(mr: MergeRequestWithDiffs): MrAction[] {
    const onHold = mr.labels.includes('hold');
    const autoUpdate = mr.labels.includes('nvchecker') && !onHold;

    return MR_ACTIONS.filter((action) => !(action === 'hold' && onHold) && !(action === 'dangerous' && autoUpdate));
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
    /**
     * The finding cards live above the diffs; jump to the file section first
     * so the deferred diff renderer mounts, then it reveals the exact line.
     */
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
    if (!info) return null;

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
