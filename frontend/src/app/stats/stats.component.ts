import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef, Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Select } from '@openng/optimus-ui/select';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { REPO_OPTIONS } from '../deploy-log/deploy-log.service';
import { resourceValue, setPageSeo } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { CompactNumberPipe } from '../pipes/compact-number.pipe';
import { TitleComponent } from '../title/title.component';
import { UnknownValueComponent } from '../ui-states/unknown-value.component';
import { isStatsTab, StatsService, type StatsTab } from './stats.service';

const ALL_TIME_RANGE_PARAM = 'all';

interface StatsTabLink {
  value: StatsTab;
  labelKey: string;
  tooltipKey: string;
}

const STATS_TAB_LINKS: StatsTabLink[] = [
  {
    value: 'search',
    labelKey: marker('stats.tabs.search.label'),
    tooltipKey: marker('stats.tabs.search.tooltip'),
  },
  {
    value: 'globals',
    labelKey: marker('stats.tabs.globals.label'),
    tooltipKey: marker('stats.tabs.globals.tooltip'),
  },
  {
    value: 'downloads',
    labelKey: marker('stats.tabs.downloads.label'),
    tooltipKey: marker('stats.tabs.downloads.tooltip'),
  },
  {
    value: 'update-review',
    labelKey: marker('stats.tabs.updateReview.label'),
    tooltipKey: marker('stats.tabs.updateReview.tooltip'),
  },
  {
    value: 'builder-stats',
    labelKey: marker('stats.tabs.builderStats.label'),
    tooltipKey: marker('stats.tabs.builderStats.tooltip'),
  },
  {
    value: 'resource-usage',
    labelKey: marker('stats.tabs.resourceUsage.label'),
    tooltipKey: marker('stats.tabs.resourceUsage.tooltip'),
  },
  {
    value: 'additions',
    labelKey: marker('stats.tabs.additions.label'),
    tooltipKey: marker('stats.tabs.additions.tooltip'),
  },
  {
    value: 'insights',
    labelKey: marker('stats.tabs.insights.label'),
    tooltipKey: marker('stats.tabs.insights.tooltip'),
  },
];

interface SelectOption<TValue> {
  label: string;
  value: TValue;
}

function timeRangeToParam(days: number | null): string {
  return days === null ? ALL_TIME_RANGE_PARAM : String(days);
}

function paramToTimeRange(value: string): number | null | undefined {
  if (value === ALL_TIME_RANGE_PARAM) return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : undefined;
}

@Component({
  selector: 'chaotic-stats',
  imports: [
    TabList,
    Tabs,
    Tab,
    CompactNumberPipe,
    DecimalPipe,
    FormsModule,
    Select,
    TitleComponent,
    Tooltip,
    RouterOutlet,
    TranslocoDirective,
    UnknownValueComponent,
  ],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly statsService = inject(StatsService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly search = input<string>();

  private readonly applyInitialRange = this.initTimeRangeFromRoute();

  private initTimeRangeFromRoute(): void {
    const param = this.route.snapshot.queryParamMap.get('range');
    if (param === null) return;
    const days = paramToTimeRange(param);
    if (days !== undefined) this.statsService.timeRangeDays.set(days);
  }

  private readonly applyInitialRepo = this.initRepoFromRoute();

  private initRepoFromRoute(): void {
    const param = this.route.snapshot.queryParamMap.get('repo');
    if (param === null || !this.statsService.isValidRepo(param)) return;
    this.statsService.selectedRepo.set(param);
    this.statsService.packageSearchSelectedRepo.set(param);
  }

  private readonly usersResource = httpResource<number>(() =>
    this.appService.getUsersResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  protected readonly activeTab = signal<StatsTab | null>(this.tabFromUrl(this.router.url));

  protected readonly repoFilterVisible = computed(() => {
    const tab = this.activeTab();
    return tab === 'globals' || tab === 'downloads';
  });

  private tabFromUrl(url: string): StatsTab | null {
    const path = url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
    return isStatsTab(path) ? (path as StatsTab) : null;
  }

  constructor() {
    setPageSeo(
      this.transloco.translate('stats.seo.title'),
      this.transloco.translate('stats.seo.description'),
      this.transloco.translate('stats.seo.keywords'),
    );
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.activeTab.set(
          event instanceof NavigationEnd ? this.tabFromUrl(event.urlAfterRedirects) : this.tabFromUrl(event.url),
        );
      });

    effect(() => {
      const users = resourceValue(this.usersResource);
      this.statsService.usersLoading.set(this.usersResource.isLoading());
      this.statsService.totalUsers.set(users ?? null);
      this.cdr.markForCheck();
    });

    // When arriving with a ?search= package name, always show the Search tab
    // so the package detail is actually visible.
    effect(() => {
      const q = this.search();
      if (typeof q === 'string' && q.trim()) {
        void this.router.navigate(['search'], {
          relativeTo: this.route,
          replaceUrl: true,
          queryParamsHandling: 'merge',
        });
        this.cdr.markForCheck();
      }
    });
  }

  protected readonly tabs = STATS_TAB_LINKS;
  protected readonly searchRepoOptions = REPO_OPTIONS;

  protected readonly repoOptions = computed<SelectOption<string>[]>(() => {
    this.activeTranslation();

    const allRepos = { label: this.transloco.translate('common.all'), value: '' };
    const repos = REPO_OPTIONS.map((repo) => ({ label: repo, value: repo }));

    return [allRepos, ...repos];
  });

  protected readonly timeRangeOptions = computed<SelectOption<number | null>[]>(() => {
    this.activeTranslation();

    return this.statsService.timeRangeOptions.map((range) => ({
      label: this.transloco.translate(range.labelKey),
      value: range.days,
    }));
  });

  ngOnInit(): void {
    // Legacy deep links used fragments (#builder-stats); forward them to the
    // corresponding child route once.
    const fragment = this.route.snapshot.fragment;
    if (fragment !== null && isStatsTab(fragment)) {
      void this.router.navigate([fragment], {
        relativeTo: this.route,
        replaceUrl: true,
      });
    }
  }

  protected navigate(value: string | number | undefined): void {
    if (typeof value === 'string' && isStatsTab(value)) {
      void this.router.navigate([value], {
        relativeTo: this.route,
      });
    }
  }

  protected onTimeRangeChange(days: number | null | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { range: timeRangeToParam(days ?? null) },
      queryParamsHandling: 'merge',
    });
  }

  protected onRepoChange(repo: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { repo: repo || null },
      queryParamsHandling: 'merge',
    });
  }
}
