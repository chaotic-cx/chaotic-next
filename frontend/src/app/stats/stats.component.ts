import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef, Component, computed, effect, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Card } from '@openng/optimus-ui/card';
import { Select } from '@openng/optimus-ui/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { ChartAverageBuildTimeComponent } from '../chart-average-build-time/chart-average-build-time.component';
import { ChartBuildersAmountComponent } from '../chart-builders-amount/chart-builders-amount.component';
import { ChartBuildsPerDayComponent } from '../chart-builds-per-day/chart-builds-per-day.component';
import { ChartCountriesComponent } from '../chart-countries/chart-countries.component';
import { ChartDownloadsComponent } from '../chart-downloads/chart-downloads.component';
import { ChartPopularPackagesComponent } from '../chart-popular-packages/chart-popular-packages.component';
import { ChartReviewStatsComponent } from '../chart-review-stats/chart-review-stats.component';
import { ChartUseragentComponent } from '../chart-useragent/chart-useragent.component';
import { SearchPackageComponent } from '../search-package/search-package.component';
import { TitleComponent } from '../title/title.component';
import { StatsService, isStatsTab } from './stats.service';

@Component({
  selector: 'chaotic-stats',
  imports: [
    TabList,
    Tabs,
    Tab,
    TabPanels,
    TabPanel,
    ChartCountriesComponent,
    ChartUseragentComponent,
    ChartDownloadsComponent,
    FormsModule,
    Card,
    Select,
    TitleComponent,
    SearchPackageComponent,
    ChartReviewStatsComponent,
    ChartBuildsPerDayComponent,
    ChartPopularPackagesComponent,
    ChartBuildersAmountComponent,
    ChartAverageBuildTimeComponent,
    Tooltip,
  ],
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

  private readonly usersResource = httpResource<number>(() =>
    this.appService.getUsersResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  constructor() {
    effect(() => {
      const users = this.usersResource.value();
      this.statsService.usersLoading.set(this.usersResource.isLoading());
      this.statsService.totalUsers.set(users ?? null);
      this.cdr.markForCheck();
    });

    effect(() => {
      const q = this.search();
      if (typeof q === 'string' && q.trim()) {
        this.statsService.currentTab.set('search');
        this.cdr.markForCheck();
      }
    });
  }

  readonly subtitle = computed(() => {
    const users = this.statsService.usersLoading() ? 'loading…' : (this.statsService.totalUsers() ?? '–');
    return `Area for package statistics and other fun stuff.<br>Total users: ${users}`;
  });

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Statistics and data',
      description: 'Package and repository statistics for Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package statistics',
      url: this.router.url,
    });

    const fragment = this.route.snapshot.fragment;
    if (fragment !== null && isStatsTab(fragment)) {
      this.statsService.currentTab.set(fragment);
    } else {
      this.statsService.currentTab.set('search');
      history.replaceState(null, '', '#search');
    }
  }

  changeTab($event: string | number | undefined): void {
    if (typeof $event === 'string' && isStatsTab($event)) {
      history.replaceState(null, '', `#${$event}`);
    }
  }
}
