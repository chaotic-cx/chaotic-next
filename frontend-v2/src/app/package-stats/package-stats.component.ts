import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
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
import { FilterService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { MessageModule } from 'primeng/message';
import { Card } from 'primeng/card';

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
    ToastModule,
    MessageModule,
    Card,
  ],
  templateUrl: './package-stats.component.html',
  styleUrl: './package-stats.component.css',
  providers: [MessageService],
})
export class PackageStatsComponent implements OnInit {
  suggestionPool = signal<string[]>([]);
  currentSuggestions: string[] = [];
  totalUsers = signal<string>('Loading...');
  loading = true;

  filterService = inject(FilterService);

  search(event: AutoCompleteCompleteEvent) {
    if (event.query.length < 3) return;

    if (/^[0-9|a-zA-Z-]*$/.test(event.query)) {
      this.currentSuggestions = this.filterService.filters['contains'](this.suggestionPool(), event.query);
    } else {
      this.messageService.add({
        severity: 'warning',
        summary: 'Invalid input',
        detail: 'This does not look like a valid package name!',
        key: 'pkgname-invalid',
      });
    }
  }

  constructor(
    private appService: AppService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
  ) {}

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
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load suggestions',
          });
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
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to users count',
          });
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
          this.loading = false;
          this.initialSearchDone = true;
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load package data',
          });
          console.error(err);
        },
      });
  }
}
