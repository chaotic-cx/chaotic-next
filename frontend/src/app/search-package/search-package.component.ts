import { CommonModule } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, pattern } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { formatPkgrel, Package, PKGNAME_PATTERN, SpecificPackageMetrics } from '@chaotic-next/shared-lib';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { ChartPackageAverageBuildTimeComponent } from '../stats/charts/packages/chart-package-average-build-time/chart-package-average-build-time.component';
import { ChartPackageBuildStatsComponent } from '../stats/charts/packages/chart-package-build-stats/chart-package-build-stats.component';
import { ChartPackageResourceStatsComponent } from '../stats/charts/packages/chart-package-resource-stats/chart-package-resource-stats.component';
import { resourceValue, setPageSeo } from '../functions';
import { PackageTriggerSourcesComponent } from '../package-trigger-sources/package-trigger-sources.component';
import { PackageDetailKeyPipe } from '../pipes/package-detail-key.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'chaotic-search-package',
  imports: [
    AutoComplete,
    CommonModule,
    FormsModule,
    PackageDetailKeyPipe,
    RelativeTimePipe,
    Tooltip,
    ChartPackageBuildStatsComponent,
    ChartPackageAverageBuildTimeComponent,
    ChartPackageResourceStatsComponent,
    PackageTriggerSourcesComponent,
  ],
  templateUrl: './search-package.component.html',
  styleUrl: './search-package.component.css',
})
export class SearchPackageComponent {
  private readonly http = inject(HttpClient);
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly packageStatsService = inject(StatsService);

  readonly STAGGER_CAP = 8;

  readonly search = input<string>();

  private readonly resultsSection = viewChild<ElementRef<HTMLElement>>('resultsSection');
  protected readonly currentPackageName = signal<string>('');
  private readonly scrollToResults = !!this.route.snapshot.queryParamMap.get('search');

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    pattern(schemaPath.query, PKGNAME_PATTERN, { message: 'Invalid package name' });
  });

  protected readonly suggestions = signal<string[]>([]);
  private suggestionGeneration = 0;

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

  protected readonly packageSearchData = computed<{ key: string; value: unknown }[]>(() => {
    const result = resourceValue(this.packageResource);
    if (!result) return [];

    const data: Record<string, unknown> = { ...result };
    const rows: { key: string; value: unknown }[] = [];

    if (data['version'] !== undefined) {
      data['version'] = `${data['version']}-${formatPkgrel(Number(data['pkgrel'] ?? 0), Number(data['bump'] ?? 0))}`;
    }
    delete data['pkgrel'];
    delete data['bump'];

    const skippedKeys = new Set([
      'id',
      'isActive',
      'skipSignalScan',
      'bumpCount',
      'bumpTriggers',
      'providedSonames',
      'requiredSonames',
      'provided_sonames',
      'required_sonames',
      'sonames',
      'lastUpdated',
    ]);
    for (const [key, value] of Object.entries(data)) {
      if (skippedKeys.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        for (const [innerKey, innerValue] of Object.entries(value)) {
          if (skippedKeys.has(innerKey)) continue;
          if (innerValue === null || innerValue === undefined) continue;
          if (Array.isArray(innerValue) && innerValue.length === 0) continue;
          if (typeof innerValue === 'string' && !innerValue.trim()) continue;
          rows.push({ key: innerKey, value: innerValue });
        }
      } else {
        if (Array.isArray(value) && value.length === 0) continue;
        if (typeof value === 'string' && !value.trim()) continue;
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

    const preferredKeyOrder: Record<string, number> = {
      pkgname: 1,
      name: 1,
      pkgbase: 1,
      version: 2,
      description: 3,
      desc: 3,
      buildDate: 4,
      createdAt: 5,
      downloads: 6,
      url: 7,
      filename: 8,
      packager: 9,
      maintainer: 9,
      license: 10,
      licenses: 10,
      deps: 11,
      depends: 11,
      makeDeps: 12,
      makedepends: 12,
      optDeps: 13,
      optdepends: 13,
      checkDepends: 14,
      checkdepends: 14,
    };

    rows.sort((a, b) => {
      const orderA = preferredKeyOrder[a.key] ?? 99;
      const orderB = preferredKeyOrder[b.key] ?? 99;
      return orderA - orderB;
    });

    return rows;
  });

  protected readonly hasSearchData = computed<boolean>(() => {
    const data = this.packageSearchData();
    return this.currentPackageName() !== '' && data.length > 0;
  });

  constructor() {
    setPageSeo(
      'Package search · Chaotic-AUR',
      'Search packages available in the Chaotic-AUR repository',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR package search',
    );
    effect(() => {
      const q = this.search();
      if (!q) return;
      this.searchModel.update((model) => ({ ...model, query: q }));
      this.currentPackageName.set(q);
    });

    effect(() => {
      if (!this.scrollToResults || !this.hasSearchData()) return;
      this.resultsSection()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async searchSuggestions(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (query.length < 3) {
      this.suggestions.set([]);
      return;
    }
    const generation = ++this.suggestionGeneration;
    try {
      const names = await this.appService.fetchPkgnameSuggestions(query, this.repo());
      if (generation !== this.suggestionGeneration) return;
      this.suggestions.set(names);
    } catch {
      if (generation === this.suggestionGeneration) this.suggestions.set([]);
    }
  }

  selectPackage(query: string): void {
    if (!query.trim()) return;
    this.searchModel.update((model) => ({ ...model, query }));
    this.currentPackageName.set(query);
    this.syncSearchParam(query);
    this.cdr.markForCheck();
  }

  async onEnter(): Promise<void> {
    const typed = this.searchModel().query.trim();
    if (!typed || !this.searchForm.query().valid()) return;
    this.selectPackage(typed);
    await this.commitPackage(typed);
  }

  async onInputBlur(): Promise<void> {
    const typed = this.searchModel().query.trim();
    if (!typed) {
      this.currentPackageName.set('');
      this.clearSearchParam();
      return;
    }
    if (!this.searchForm.query().valid()) return;
    await this.commitPackage(typed);
  }

  private repo(): string {
    return this.packageStatsService.packageSearchSelectedRepo();
  }

  private async commitPackage(pkgname: string): Promise<void> {
    const names = await this.appService.fetchPkgnameSuggestions(pkgname, this.repo());
    if (!names.includes(pkgname)) {
      this.currentPackageName.set('');
      return;
    }
    this.currentPackageName.set(pkgname);
    this.syncSearchParam(pkgname);
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.onEnter();
  }

  private syncSearchParam(query: string): void {
    if (!query.trim()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: query },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private clearSearchParam(): void {
    if (!this.route.snapshot.queryParamMap.has('search')) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected getMirrorDownloadUrl(filename: string): string {
    const repo = this.packageStatsService.packageSearchSelectedRepo() || 'chaotic-aur';
    return `https://cdn-mirror.chaotic.cx/${repo}/x86_64/${filename}`;
  }

  protected isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  protected isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  protected isNumber(value: unknown): value is number {
    return typeof value === 'number';
  }

  protected isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  protected asString(value: unknown): string {
    return typeof value === 'string' ? value : String(value ?? '');
  }

  protected asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value);
  }

  protected asDate(value: unknown): string | number | Date {
    if (value instanceof Date) return value;
    const num = Number(value);
    return Number.isFinite(num) ? num : String(value ?? '');
  }
}
