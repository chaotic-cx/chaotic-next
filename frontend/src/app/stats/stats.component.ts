import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Card } from 'primeng/card';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { ChartCountriesComponent } from '../chart-countries/chart-countries.component';
import { ChartDownloadsComponent } from '../chart-downloads/chart-downloads.component';
import { ChartUseragentComponent } from '../chart-useragent/chart-useragent.component';
import { SearchPackageComponent } from '../search-package/search-package.component';
import { TitleComponent } from '../title/title.component';
import { StatsService } from './stats.service';
import { ChartReviewStatsComponent } from '../chart-review-stats/chart-review-stats.component';
import { ChartBuildsPerDayComponent } from '../chart-builds-per-day/chart-builds-per-day.component';
import { ChartPopularPackagesComponent } from '../chart-popular-packages/chart-popular-packages.component';
import { ChartBuildersAmountComponent } from '../chart-builders-amount/chart-builders-amount.component';
import { ChartAverageBuildTimeComponent } from '../chart-average-build-time/chart-average-build-time.component';

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
  ],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statsService = inject(StatsService);

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
      void this.router.navigate([], { fragment: 'search', queryParamsHandling: 'merge' });
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
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load users count');
          console.error(err);
        },
      });
  }

  changeTab($event: string | number | undefined): void {
    switch ($event) {
      case '0':
        void this.router.navigate([], { fragment: 'search', queryParamsHandling: 'replace' });
        break;
      case '1':
        void this.router.navigate([], { fragment: 'downloads', queryParamsHandling: 'replace' });
        break;
      case '2':
        void this.router.navigate([], { fragment: 'globals', queryParamsHandling: 'replace' });
        break;
      case '3':
        void this.router.navigate([], { fragment: 'update-review', queryParamsHandling: 'replace' });
        break;
      case '4':
        void this.router.navigate([], { fragment: 'builder-stats', queryParamsHandling: 'replace' });
        break;
    }
  }
}
