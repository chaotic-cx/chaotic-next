import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { FilterService } from '@openng/optimus-ui/api';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { debounceTime, retry, Subject } from 'rxjs';
import { AppService } from '../app.service';
import { ChartPackageBuildStatsComponent } from '../chart-package-build-stats/chart-package-build-stats.component';
import { PackageDetailKeyPipe } from '../pipes/package-detail-key.pipe';
import { UnixDatePipe } from '../pipes/unix-date.pipe';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'chaotic-search-package',
  imports: [
    CommonModule,
    AutoComplete,
    TableModule,
    PackageDetailKeyPipe,
    UnixDatePipe,
    FormsModule,
    Select,
    ChartPackageBuildStatsComponent,
  ],
  templateUrl: './search-package.component.html',
  styleUrl: './search-package.component.css',
  providers: [FilterService],
})
export class SearchPackageComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly filterService = inject(FilterService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly packageStatsService = inject(StatsService);

  protected readonly autoComplete = viewChild<AutoComplete>('autoComplete');
  protected readonly repoOptions = ['chaotic-aur', 'garuda'];
  protected readonly currentPackageName = signal<string>('');
  private packageNameSubject = new Subject<string>();

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params['search'] && /^[0-9|a-zA-Z-]*$/.test(params['search'])) {
        this.updateDisplay(params['search']);
        this.cdr.markForCheck();
      }
    });

    this.packageNameSubject.pipe(debounceTime(500), takeUntilDestroyed()).subscribe((packageName) => {
      this.currentPackageName.set(packageName);
      this.cdr.markForCheck();
    });
  }

  ngOnInit() {
    this.getSuggestions();

    this.appService.updateSeoTags(
      this.meta,
      'Package search',
      'Search packages available in the Chaotic-AUR repository',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package search',
      this.router.url,
    );
  }

  search(event: AutoCompleteCompleteEvent) {
    if (event.query.length < 3) return;

    if (/^[0-9|a-zA-Z-]*$/.test(event.query)) {
      this.packageStatsService.packageSearchCurrentSuggestions.set(
        this.packageStatsService
          .packageSearchSuggestionPool()
          .filter((name) => this.filterService.filters['contains'](name, event.query)),
      );
      this.autoComplete()!.inputStyleClass = '';
      void this.router.navigate(['/stats'], { queryParams: { search: event.query } });
      this.cdr.markForCheck();
    } else {
      this.autoComplete()!.inputStyleClass = 'ng-invalid ng-dirty';
      this.cdr.markForCheck();
    }
  }

  getSuggestions() {
    this.appService
      .getPackageList()
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (data) => {
          const names = data.map((pkg) => pkg.pkgname);
          this.packageStatsService.packageSearchSuggestionPool.set([...new Set(names)]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load suggestions');
          console.error(err);
        },
      });
  }

  updateDisplay(query: string): void {
    this.packageNameSubject.next(query);

    this.appService.getPackage(query, this.packageStatsService.packageSearchSelectedRepo()).subscribe({
      next: (result) => {
        this.packageStatsService.packageSearchPackageData.set(result);
        const data = result as Record<string, any>;
        const newData = [];

        if (!data) return;
        if (!Object.hasOwn(data, 'pkgrel') || !Object.hasOwn(data, 'version')) {
          this.messageToastService.warn(
            'Error',
            'Package data is incomplete, this is due to switching to per-repo statistics not too long ago.',
          );
          data['version'] = data['version'] || 'unknown';
        } else {
          data['version'] = `${data['version']}-${data['pkgrel']}`;
          delete data['pkgrel'];
        }

        for (const key in data) {
          if (key === 'isActive') continue;
          if (data[key] && typeof data[key] !== 'object') {
            newData.push({ key: key, value: data[key] });
          } else if (data[key] && typeof data[key] === 'object') {
            for (const innerKey in data[key]) {
              newData.push({ key: innerKey, value: data[key][innerKey] });
            }
          }
        }

        this.packageStatsService.packageSearchData.set(newData);
        this.packageStatsService.packageSearchInitialSearchDone.set(true);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to load package metrics');
        console.error(err);
      },
    });

    this.appService.getSpecificPackageMetrics(query).subscribe({
      next: (result) => {
        const data = this.packageStatsService.packageSearchData();
        if (data.filter((d) => d.key === 'downloads')) {
          const exists = data.find((d) => d.key === 'downloads');
          if (!exists) return;
          const key: number = data.findIndex((d) => d.key === 'downloads');
          this.packageStatsService.packageSearchData.update((current) => {
            current[key] = { key: 'downloads', value: result.downloads };
            return current;
          });
        } else {
          this.packageStatsService.packageSearchData.set([...data, { key: 'downloads', value: result.downloads }]);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to load package data');
        console.error(err);
      },
    });
  }
}
