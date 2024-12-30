import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppService } from '../app.service';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import type { SpecificPackageMetrics } from '@./shared-lib';
import { ChartCountriesComponent } from '../chart-countries/chart-countries.component';
import { ChartUseragentComponent } from '../chart-useragent/chart-useragent.component';
import { ChartDownloadsComponent } from '../chart-downloads/chart-downloads.component';
import { FormsModule } from '@angular/forms';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { retry } from 'rxjs';
import { FilterService } from 'primeng/api';
import { Card } from 'primeng/card';
import { MessageToastService } from '@garudalinux/core';

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
    AutoComplete,
    Card,
  ],
  templateUrl: './package-stats.component.html',
  styleUrl: './package-stats.component.css',
  providers: [MessageToastService],
})
export class PackageStatsComponent implements OnInit {
  suggestionPool = signal<string[]>([]);
  currentSuggestions: string[] = [];
  totalUsers = signal<string>('Loading...');
  loading = true;

  private readonly appService = inject(AppService);
  private readonly filterService = inject(FilterService);
  private readonly messageToastService = inject(MessageToastService);

  search(event: AutoCompleteCompleteEvent) {
    if (event.query.length < 3) return;

    if (/^[0-9|a-zA-Z-]*$/.test(event.query)) {
      this.currentSuggestions = this.filterService.filters['contains'](this.suggestionPool(), event.query);
    } else {
      this.messageToastService.warn('Invalid input', 'This does not look like a valid package name!');
    }
  }

  async ngOnInit(): Promise<void> {
    void this.get30DayUsers();
    this.getSuggestions();
  }

  getSuggestions() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (data: { isActive: boolean; pkgname: string }[]) => {
          this.suggestionPool.set(
            data
              .filter((pkg) => {
                return pkg.isActive;
              })
              .map((pkg) => pkg.pkgname),
          );
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load suggestions');
          console.error(err);
        },
      });
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

  packageMetrics: SpecificPackageMetrics = { downloads: 0, user_agents: [] };
  initialSearchDone = false;

  updateDisplay(query: string): void {
    this.appService
      .getSpecificPackageMetrics(query)
      .pipe(retry({ delay: 2000 }))
      .subscribe({
        next: (result) => {
          this.packageMetrics = result;
          this.initialSearchDone = true;
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load package data');
          console.error(err);
        },
        complete: () => {
          this.loading = false;
        },
      });
  }
}
