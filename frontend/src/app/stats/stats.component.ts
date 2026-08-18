import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef, Component, effect, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Select } from '@openng/optimus-ui/select';
import { Tab, TabList, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { filter } from 'rxjs';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';
import { TitleComponent } from '../title/title.component';
import { isStatsTab, StatsService, type StatsTab } from './stats.service';

const ALL_TIME_RANGE_PARAM = 'all';

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
  imports: [TabList, Tabs, Tab, FormsModule, Select, TitleComponent, Tooltip, RouterOutlet],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statsService = inject(StatsService);

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
    if (param !== null && this.statsService.repoOptions.includes(param)) {
      this.statsService.packageSearchSelectedRepo.set(param);
    }
  }

  private readonly usersResource = httpResource<number>(() =>
    this.appService.getUsersResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  protected readonly activeTab = signal<StatsTab | null>(this.tabFromUrl(this.router.url));

  private tabFromUrl(url: string): StatsTab | null {
    const path = url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
    return isStatsTab(path) ? (path as StatsTab) : null;
  }

  constructor() {
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
          info: { disableViewTransition: true },
        });
        this.cdr.markForCheck();
      }
    });
  }

  readonly subtitle = 'Area for package statistics and other fun stuff.';

  ngOnInit(): void {
    this.appService.updateSeoTags(this.meta, {
      title: 'Statistics and data',
      description: 'Package and repository statistics for Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package statistics',
      url: this.router.url,
    });

    // Legacy deep links used fragments (#builder-stats); forward them to the
    // corresponding child route once.
    const fragment = this.route.snapshot.fragment;
    if (fragment !== null && isStatsTab(fragment)) {
      void this.router.navigate([fragment], {
        relativeTo: this.route,
        replaceUrl: true,
        info: { disableViewTransition: true },
      });
    }
  }

  protected navigate(value: string | number | undefined): void {
    if (typeof value === 'string' && isStatsTab(value)) {
      void this.router.navigate([value], {
        relativeTo: this.route,
        info: { disableViewTransition: true },
      });
    }
  }

  protected onTimeRangeChange(days: number | null | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { range: timeRangeToParam(days ?? null) },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }

  protected onRepoChange(repo: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { repo: repo || null },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }
}
