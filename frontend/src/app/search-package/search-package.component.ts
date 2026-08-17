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
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Package, Paginated, SpecificPackageMetrics } from '@chaotic-next/shared-lib';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { debounceTime, Subject } from 'rxjs';
import { AppService } from '../app.service';
import { ChartPackageBuildStatsComponent } from '../chart-package-build-stats/chart-package-build-stats.component';
import { PackageTriggerSourcesComponent } from '../package-trigger-sources/package-trigger-sources.component';
import { REPO_OPTIONS } from '../deploy-log/deploy-log.service';
import { resourceValue } from '../functions';
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
    PackageTriggerSourcesComponent,
  ],
  templateUrl: './search-package.component.html',
  styleUrl: './search-package.component.css',
})
export class SearchPackageComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly packageStatsService = inject(StatsService);

  readonly search = input<string>();

  protected readonly autoComplete = viewChild<AutoComplete>('autoComplete');
  protected readonly repoOptions = REPO_OPTIONS;
  protected readonly typedInput = signal<string>('');
  protected readonly currentPackageName = signal<string>('');

  private readonly suggestionsQuerySubject = new Subject<string>();
  private readonly suggestionsQuery = signal<string>('');
  private readonly packageNameSubject = new Subject<string>();

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
    ...new Set((resourceValue(this.suggestionsResource)?.items ?? []).map((pkg) => pkg.pkgname)),
  ]);

  protected readonly packageSearchData = computed<{ key: string; value: unknown }[]>(() => {
    const result = resourceValue(this.packageResource);
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
    const repoParam = this.route.snapshot.queryParamMap.get('repo');
    if (repoParam && this.repoOptions.includes(repoParam)) {
      this.packageStatsService.packageSearchSelectedRepo.set(repoParam);
    }

    this.suggestionsQuerySubject
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((query) => this.suggestionsQuery.set(query));

    this.packageNameSubject.pipe(debounceTime(400), takeUntilDestroyed()).subscribe((query) => {
      if (/^[a-zA-Z0-9@.+_-]+$/.test(query)) {
        this.currentPackageName.set(query);
      }
    });

    effect(() => {
      const q = this.search();
      if (q && /^[a-zA-Z0-9@.+_-]+$/.test(q)) {
        this.typedInput.set(q);
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
      this.suggestionsQuerySubject.next(event.query);
      if (autocomplete) autocomplete.inputStyleClass = '';
      this.cdr.markForCheck();
    } else {
      if (autocomplete) autocomplete.inputStyleClass = 'ng-invalid ng-dirty';
      this.cdr.markForCheck();
    }
  }

  selectPackage(query: string): void {
    if (/^[a-zA-Z0-9@.+_-]+$/.test(query)) {
      this.typedInput.set(query);
      this.currentPackageName.set(query);
      this.syncSearchParam(query);
    }
  }

  onInputBlur(): void {
    const typed = this.typedInput();
    if (/^[a-zA-Z0-9@.+_-]+$/.test(typed)) {
      this.currentPackageName.set(typed);
      this.syncSearchParam(typed);
    }
  }

  updateDisplay(query: string): void {
    if (/^[a-zA-Z0-9@.+_-]+$/.test(query)) {
      this.typedInput.set(query);
      this.packageNameSubject.next(query);
    }
  }

  private syncSearchParam(query: string): void {
    if (!/^[a-zA-Z0-9@.+_-]+$/.test(query)) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: query },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      info: { disableViewTransition: true },
    });
  }

  protected onRepoChange(repo: string): void {
    this.packageStatsService.packageSearchSelectedRepo.set(repo);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { repo },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }
}
