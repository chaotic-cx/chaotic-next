import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { ChartCountriesComponent } from '../chart-countries/chart-countries.component';
import { ChartUseragentComponent } from '../chart-useragent/chart-useragent.component';
import { ChartDownloadsComponent } from '../chart-downloads/chart-downloads.component';
import { FormsModule } from '@angular/forms';
import { Card } from 'primeng/card';
import { MessageToastService } from '@garudalinux/core';
import { TitleComponent } from '../title/title.component';
import { SearchPackageComponent } from '../search-package/search-package.component';
import { retry } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'chaotic-package-stats',
  imports: [
    CommonModule,
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
  ],
  templateUrl: './package-stats.component.html',
  styleUrl: './package-stats.component.css',
  providers: [MessageToastService],
})
export class PackageStatsComponent implements OnInit {
  loading = signal<boolean>(false);
  totalUsers = signal<string>('Loading... ☕');
  currentTab = '0';

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);

  async ngOnInit(): Promise<void> {
    this.updateMetaTags();
    void this.get30DayUsers();

    if (this.route.snapshot.fragment === 'globals') {
      this.currentTab = '1';
    } else if (this.route.snapshot.fragment === 'downloads') {
      this.currentTab = '2';
    } else {
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
          this.totalUsers.set(res);
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load users count');
          console.error(err);
        },
      });
  }

  changeTab($event: string | number) {
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
    }
  }

  private updateMetaTags() {
    this.titleService.setTitle('Chaotic-AUR - package stats');
    this.meta.addTag({ name: 'description', content: 'Chaotic-AUR package and repository statistics' });
    this.meta.addTag({ name: 'keywords', content: 'Chaotic-AUR, AUR, repository, Archlinux' });
    this.meta.addTag({ property: 'og:title', content: 'Chaotic-AUR - package stats' });
    this.meta.addTag({ property: 'og:description', content: 'Chaotic-AUR package and repository statistics' });
    this.meta.addTag({ property: 'og:image', content: '/assets/logo.webp' });
  }
}