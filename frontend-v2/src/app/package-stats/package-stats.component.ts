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
  loading = true;
  totalUsers = signal<string>('Loading...');

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  async ngOnInit(): Promise<void> {
    void this.get30DayUsers();
  }

  /**
   * Get total users count.
   */
  async get30DayUsers(): Promise<void> {
    this.appService
      .get30dayUsers()
      .pipe(retry({ delay: 2000 }))
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
}
