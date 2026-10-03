import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CHAOTIC_AUR_REPO,
  formatPkgrel,
  Package,
  PKGNAME_PATTERN,
  ParsedPackageMetadata,
  SpecificPackageMetrics,
} from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { RequestFailure, requestFailure } from '../api-errors';
import { AppService } from '../app.service';
import { ChartPackageAverageBuildTimeComponent } from '../stats/charts/packages/chart-package-average-build-time/chart-package-average-build-time.component';
import { ChartPackageBuildStatsComponent } from '../stats/charts/packages/chart-package-build-stats/chart-package-build-stats.component';
import { ChartPackageResourceStatsComponent } from '../stats/charts/packages/chart-package-resource-stats/chart-package-resource-stats.component';
import { CodeBlockComponent } from '../docs/code-block.component';
import { preferredScrollBehavior, resourceValue, setPageSeo } from '../functions';
import { bindRecordTitle } from '../i18n/record-title';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { PackageTriggerSourcesComponent } from '../package-trigger-sources/package-trigger-sources.component';
import { IsoDateTimePipe } from '../pipes/iso-date-time.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { StatsService } from '../stats/stats.service';
import { SLOW_LOADING_AFTER_MS } from '../table-skeleton/skeleton-timing';
import { delayedFlag } from '../utils/delayed-flag';
import { RecentSearchesService } from './recent-searches.service';

type PackageListKey =
  'deps' | 'makeDeps' | 'optDeps' | 'checkDepends' | 'provides' | 'conflicts' | 'replaces' | 'soNameList';

const PACKAGE_LIST_GROUPS: { key: PackageListKey; labelKey: string }[] = [
  { key: 'deps', labelKey: marker('searchPackage.groups.deps') },
  { key: 'optDeps', labelKey: marker('searchPackage.groups.optDeps') },
  { key: 'makeDeps', labelKey: marker('searchPackage.groups.makeDeps') },
  { key: 'checkDepends', labelKey: marker('searchPackage.groups.checkDepends') },
  { key: 'provides', labelKey: marker('searchPackage.groups.provides') },
  { key: 'conflicts', labelKey: marker('searchPackage.groups.conflicts') },
  { key: 'replaces', labelKey: marker('searchPackage.groups.replaces') },
  { key: 'soNameList', labelKey: marker('searchPackage.groups.soNameList') },
];

const OPTIONAL_DEPENDENCY_SEPARATOR = ': ';
const MS_PER_SECOND = 1000;
const MIN_SUGGESTION_QUERY_LENGTH = 3;
const SKELETON_FACT_CELLS = [0, 1, 2, 3];

const RATE_LIMITED_KEY = marker('searchPackage.error.rateLimited');
const GENERIC_FAILURE_KEY = marker('searchPackage.error.generic');

interface PackageListEntry {
  name: string;
  note: string | null;
}

interface PackageListGroup {
  labelKey: string;
  entries: PackageListEntry[];
}

interface PackageSheet {
  pkgname: string;
  pkgbaseName: string | null;
  version: string | null;
  repo: string;
  description: string | null;
  homepage: string | null;
  packager: string | null;
  license: string | null;
  filename: string | null;
  builtAt: number | null;
  addedAt: string | null;
  groups: PackageListGroup[];
}

@Component({
  selector: 'chaotic-search-package',
  imports: [
    AutoComplete,
    DatePipe,
    DecimalPipe,
    FormsModule,
    IsoDateTimePipe,
    LoadErrorComponent,
    RelativeTimePipe,
    RouterLink,
    Tooltip,
    CodeBlockComponent,
    ChartPackageBuildStatsComponent,
    ChartPackageAverageBuildTimeComponent,
    ChartPackageResourceStatsComponent,
    PackageTriggerSourcesComponent,
    TranslocoDirective,
  ],
  templateUrl: './search-package.component.html',
  styleUrls: ['./search-package.component.css'],
})
export class SearchPackageComponent {
  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly packageStatsService = inject(StatsService);
  protected readonly recentSearches = inject(RecentSearchesService);

  readonly search = input<string>();

  private readonly resultsSection = viewChild<ElementRef<HTMLElement>>('resultsSection');
  protected readonly currentPackageName = signal<string>('');
  private readonly scrollToResults = !!this.route.snapshot.queryParamMap.get('search');

  protected readonly searchModel = signal({ query: '' });
  protected readonly searchForm = form(this.searchModel, (schemaPath) => {
    pattern(schemaPath.query, PKGNAME_PATTERN, { message: this.transloco.translate('searchPackage.invalidName') });
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

  protected readonly sheet = computed<PackageSheet | null>(() => {
    const pkg = resourceValue(this.packageResource);
    if (!pkg) return null;
    return toPackageSheet(pkg, this.repo() || CHAOTIC_AUR_REPO);
  });

  protected readonly downloads = computed(() => this.packageMetricsResource.value()?.downloads ?? null);

  protected readonly installCommand = computed(() => {
    const sheet = this.sheet();
    return sheet ? `$ sudo pacman -S ${sheet.repo}/${sheet.pkgname}` : '';
  });

  protected readonly hasSearchData = computed<boolean>(() => this.currentPackageName() !== '' && this.sheet() !== null);

  protected readonly selectedRepo = this.packageStatsService.packageSearchSelectedRepo;
  protected readonly minSuggestionQueryLength = MIN_SUGGESTION_QUERY_LENGTH;
  protected readonly skeletonFactCells = SKELETON_FACT_CELLS;

  protected readonly packageFailure = computed<RequestFailure | null>(() => {
    if (this.packageResource.status() !== 'error') {
      return null;
    }

    return requestFailure(this.packageResource.error());
  });

  protected readonly packageError = computed(() => this.packageResource.error());

  protected readonly packageFailureKey = computed(() => {
    const failure = this.packageFailure();
    if (failure === null || failure === 'notFound') {
      return null;
    }

    return failure === 'rateLimited' ? RATE_LIMITED_KEY : GENERIC_FAILURE_KEY;
  });

  protected readonly slowLoading = delayedFlag(this.packageResource.isLoading, SLOW_LOADING_AFTER_MS);

  constructor() {
    bindRecordTitle(computed(() => this.sheet()?.pkgname));

    setPageSeo(
      this.transloco.translate('searchPackage.seo.title'),
      this.transloco.translate('searchPackage.seo.description'),
      this.transloco.translate('searchPackage.seo.keywords'),
    );
    effect(() => {
      const q = this.search();
      if (!q) return;
      this.searchModel.update((model) => ({ ...model, query: q }));
      this.currentPackageName.set(q);
    });

    effect(() => {
      const pkgname = this.sheet()?.pkgname;
      if (pkgname) this.recentSearches.add(pkgname);
    });

    effect(() => {
      if (!this.scrollToResults || !this.hasSearchData()) return;
      this.resultsSection()?.nativeElement.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
    });
  }

  async searchSuggestions(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (query.length < MIN_SUGGESTION_QUERY_LENGTH) {
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

  onEnter(): void {
    const typed = this.searchModel().query.trim();
    if (!typed || !this.searchForm.query().valid()) return;

    // Enter always opens the typed name, so an unknown name shows the not-found state.
    this.selectPackage(typed);
  }

  async onInputBlur(): Promise<void> {
    const typed = this.searchModel().query.trim();
    if (!typed) {
      this.currentPackageName.set('');
      this.clearSearchParam();
      return;
    }
    if (!this.searchForm.query().valid()) return;

    // Already open, for example after Enter. Committing again would hide its not-found state.
    if (typed === this.currentPackageName()) return;

    await this.commitPackage(typed);
  }

  protected retryPackage(): void {
    this.packageResource.reload();
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
      scroll: 'manual',
    });
  }

  private clearSearchParam(): void {
    if (!this.route.snapshot.queryParamMap.has('search')) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
  }

  protected getMirrorDownloadUrl(sheet: PackageSheet, filename: string): string {
    return `https://cdn-mirror.chaotic.cx/${sheet.repo}/x86_64/${filename}`;
  }
}

function toPackageSheet(pkg: Package, repo: string): PackageSheet {
  const metadata = pkg.metadata;
  return {
    pkgname: pkg.pkgname,
    pkgbaseName: pkg.pkgbaseName && pkg.pkgbaseName !== pkg.pkgname ? pkg.pkgbaseName : null,
    version: pkg.version ? `${pkg.version}-${formatPkgrel(pkg.pkgrel ?? 0, pkg.bump ?? 0)}` : null,
    repo: pkg.reponame ?? repo,
    description: nonBlank(metadata?.desc),
    homepage: nonBlank(metadata?.url),
    packager: nonBlank(metadata?.packager),
    license: nonBlank(metadata?.license),
    filename: nonBlank(metadata?.filename),
    builtAt: toBuildTimestamp(metadata?.buildDate),
    addedAt: pkg.createdAt ?? null,
    groups: metadata ? toListGroups(metadata) : [],
  };
}

function toListGroups(metadata: ParsedPackageMetadata): PackageListGroup[] {
  return PACKAGE_LIST_GROUPS.map(({ key, labelKey }) => ({
    labelKey,
    entries: (metadata[key] ?? []).map(toListEntry),
  })).filter((group) => group.entries.length > 0);
}

function toListEntry(value: string): PackageListEntry {
  const separatorIndex = value.indexOf(OPTIONAL_DEPENDENCY_SEPARATOR);
  if (separatorIndex < 0) return { name: value, note: null };

  return {
    name: value.slice(0, separatorIndex),
    note: value.slice(separatorIndex + OPTIONAL_DEPENDENCY_SEPARATOR.length),
  };
}

function toBuildTimestamp(buildDate: string | undefined): number | null {
  const seconds = Number(buildDate);
  return buildDate && Number.isFinite(seconds) ? seconds * MS_PER_SECOND : null;
}

function nonBlank(value: string | undefined): string | null {
  return value?.trim() ? value : null;
}
