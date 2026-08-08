import { ChangeDetectorRef, Component, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Card } from '@openng/optimus-ui/card';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '@openng/optimus-ui/tabs';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { retry } from 'rxjs';
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
import { StatsService } from './stats.service';

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
  providers: [MessageToastService],
})
export class StatsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statsService = inject(StatsService);

  readonly subtitle = computed(() => {
    const users = this.statsService.usersLoading() ? 'loading…' : (this.statsService.totalUsers() ?? '–');
    return `Area for package statistics and other fun stuff.
Total users last month: ${users}
All stats shown here are currently relating to one month of data.`;
  });

  async ngOnInit(): Promise<void> {
    this.appService.updateSeoTags(
      this.meta,
      'Statistics and data',
      'Package and repository statistics for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package statistics',
      this.router.url,
    );

    void this.get30DayUsers();

    if (this.route.snapshot.fragment === 'globals') {
      this.statsService.currentTab.set('1');
    } else if (this.route.snapshot.fragment === 'downloads') {
      this.statsService.currentTab.set('2');
    } else if (this.route.snapshot.fragment === 'update-review') {
      this.statsService.currentTab.set('3');
    } else if (this.route.snapshot.fragment === 'builder-stats') {
      this.statsService.currentTab.set('4');
    } else {
      this.statsService.currentTab.set('0');
      history.replaceState(null, '', '#search');
    }
  }

  /**
   * Get total users count.
   */
  async get30DayUsers(): Promise<void> {
    this.appService
      .get30dayUsers()
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (res) => {
          this.statsService.totalUsers.set(res);
          this.statsService.usersLoading.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.statsService.usersLoading.set(false);
          this.messageToastService.error('Error', 'Failed to load users count');
          console.error(err);
        },
      });
  }

  changeTab($event: string | number | undefined): void {
    switch ($event) {
      case '0':
        history.replaceState(null, '', '#search');
        break;
      case '1':
        history.replaceState(null, '', '#downloads');
        break;
      case '2':
        history.replaceState(null, '', '#globals');
        break;
      case '3':
        history.replaceState(null, '', '#update-review');
        break;
      case '4':
        history.replaceState(null, '', '#builder-stats');
        break;
    }
  }
}
