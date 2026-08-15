import { CommonModule } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Package, Paginated, SpecificPackageMetrics } from '@chaotic-next/shared-lib';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { AppService } from '../app.service';
import { ChartPackageBuildStatsComponent } from '../chart-package-build-stats/chart-package-build-stats.component';
import { REPO_OPTIONS } from '../deploy-log/deploy-log.service';
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
})
export class SearchPackageComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  protected readonly packageStatsService = inject(StatsService);

  readonly search = input<string>();

  protected readonly autoComplete = viewChild<AutoComplete>('autoComplete');
  protected readonly repoOptions = REPO_OPTIONS;
  protected readonly currentPackageName = signal<string>('');

  private readonly suggestionsQuery = signal<string>('');

  private readonly suggestionsResource = httpResource<Paginated<Package>>(() =>
    this.suggestionsQuery()
      ? this.appService.getPackagesResourceRequest({ page: 1, perPage: 200, q: this.suggestionsQuery() })
      : undefined,
  );

  private readonly packageResource = httpResource<Package>(() => {
    const name = this.currentPackageName();
    if (!name) return undefined;
    return this.appService.getPackageResourceRequest(name, this.packageStatsService.packageSearchSelectedRepo());
  });

  private readonly packageMetricsResource = httpResource<SpecificPackageMetrics>(() => {
    const name = this.currentPackageName();
    if (!name) return undefined;
    return this.appService.getSpecificPackageMetricsResourceRequest(
      name,
      this.packageStatsService.timeRangeDays() ?? undefined,
    );
  });

  protected readonly suggestions = computed<string[]>(() => [
    ...new Set((this.suggestionsResource.value()?.items ?? []).map((pkg) => pkg.pkgname)),
  ]);

  protected readonly packageSearchData = computed<{ key: string; value: unknown }[]>(() => {
    const result = this.packageResource.value();
    if (!result) return [];

    const data: Record<string, unknown> = { ...result };
    const rows: { key: string; value: unknown }[] = [];

    if (data['version'] !== undefined) {
      data['version'] = `${data['version']}-${data['pkgrel']}`;
    }
    delete data['pkgrel'];

    for (const [key, value] of Object.entries(data)) {
      if (key === 'isActive') continue;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        for (const [innerKey, innerValue] of Object.entries(value)) {
          rows.push({ key: innerKey, value: innerValue });
        }
      } else {
        rows.push({ key, value });
      }
    }

    const downloads = this.packageMetricsResource.value()?.downloads;
    if (downloads !== undefined) {
      const existingIndex = rows.findIndex((d) => d.key === 'downloads');
      if (existingIndex >= 0) {
        rows[existingIndex] = { key: 'downloads', value: downloads };
      } else {
        rows.push({ key: 'downloads', value: downloads });
      }
    }

    return rows;
  });

  protected readonly hasSearchData = computed<boolean>(() => {
    const data = this.packageSearchData();
    return this.currentPackageName() !== '' && data.length > 0;
  });

  constructor() {
    effect(() => {
      const q = this.search();
      if (q && /^[a-zA-Z0-9@.+_-]+$/.test(q)) {
        this.currentPackageName.set(q);
      }
    });
  }

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Package search',
      description: 'Search packages available in the Chaotic-AUR repository',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package search',
      url: this.router.url,
    });
  }

  onAutoCompleteSearch(event: AutoCompleteCompleteEvent) {
    if (event.query.length < 3) return;

    const autocomplete = this.autoComplete();
    if (/^[a-zA-Z0-9@.+_-]+$/.test(event.query)) {
      this.suggestionsQuery.set(event.query);
      if (autocomplete) autocomplete.inputStyleClass = '';
      void this.router.navigate(['/stats'], { queryParams: { search: event.query } });
      this.cdr.markForCheck();
    } else {
      if (autocomplete) autocomplete.inputStyleClass = 'ng-invalid ng-dirty';
      this.cdr.markForCheck();
    }
  }

  updateDisplay(query: string): void {
    if (/^[a-zA-Z0-9@.+_-]+$/.test(query)) {
      this.currentPackageName.set(query);
    }
  }
}
