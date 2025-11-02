import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, viewChild } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { FilterService } from 'primeng/api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { TableModule } from 'primeng/table';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { PackageDetailKeyPipe } from '../pipes/package-detail-key.pipe';
import { UnixDatePipe } from '../pipes/unix-date.pipe';
import { FormsModule } from '@angular/forms';
import { PackageStatsService } from '../package-stats/package-stats.service';
import { Select } from 'primeng/select';

@Component({
  selector: 'chaotic-search-package',
  imports: [CommonModule, AutoComplete, TableModule, PackageDetailKeyPipe, UnixDatePipe, FormsModule, Select],
  templateUrl: './search-package.component.html',
  styleUrl: './search-package.component.css',
  providers: [FilterService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPackageComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly filterService = inject(FilterService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly autoComplete = viewChild<AutoComplete>('autoComplete');
  protected readonly packageStatsService = inject(PackageStatsService);
  protected readonly repoOptions = ['chaotic-aur', 'garuda'];

  async ngOnInit(): Promise<void> {
    this.getSuggestions();

    this.appService.updateSeoTags(
      this.meta,
      'Package search',
      'Search packages available in the Chaotic-AUR repository',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package search',
      this.router.url,
    );

    this.route.queryParams.subscribe((params) => {
      if (params['search'] && /^[0-9|a-zA-Z-]*$/.test(params['search'])) {
        this.updateDisplay(params['search']);
        this.cdr.markForCheck();
      }
    });
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
          this.packageStatsService.packageSearchSuggestionPool.set(data.map((pkg) => pkg.pkgname));
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load suggestions');
          console.error(err);
        },
      });
  }

  updateDisplay(query: string): void {
    this.appService
      .getPackage(query, this.packageStatsService.packageSearchSelectedRepo())
      .pipe(retry({ delay: 5000, count: 3 }))
      .subscribe({
        next: (result) => {
          this.packageStatsService.packageSearchPackageData.set(result);
          const data = result as Record<string, any>;
          const newData = [];

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
