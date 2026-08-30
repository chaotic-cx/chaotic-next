import { httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { isPackageSortField, Package, type PackageSortField, Paginated, Repo } from '@chaotic-next/shared-lib';
import { APP_CONFIG } from '../../environments/app-config.token';
import { type EnvironmentModel } from '../../environments/environment.model';
import { AppService } from '../app.service';
import { resourceSignal, resourceValue } from '../functions';
import { createLazyTablePagination } from '../table-pagination';

const DEFAULT_SORT_FIELD: PackageSortField = 'pkgname';

@Service()
export class PackageListService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);

  readonly pagination = createLazyTablePagination();
  readonly sortField = signal<PackageSortField>(DEFAULT_SORT_FIELD);
  readonly sortOrder = signal<number>(1);

  readonly repoName = signal<string | undefined>(this.route.snapshot.queryParamMap.get('repo') ?? undefined);
  readonly repoFilter = computed<number | undefined>(
    () => this.repos()?.find((repo) => repo.name === this.repoName())?.id,
  );

  readonly searchValue = signal<string>(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly reposResource = httpResource<Repo[]>(() =>
    this.appConfig.backendUrl ? `${this.appConfig.backendUrl}/builder/repos` : undefined,
  );
  readonly repos = resourceSignal(this.reposResource);

  private readonly resource = httpResource<Paginated<Package>>(() => {
    if (this.repoName() && !this.repos()) return undefined;
    return this.appService.getPackagesResourceRequest({
      page: this.pagination.page(),
      perPage: this.pagination.perPage(),
      q: this.searchValue() || undefined,
      sort: this.sortField(),
      order: this.sortOrder() === 1 ? 'ASC' : 'DESC',
      repoId: this.repoFilter(),
    });
  });

  readonly loading = computed(() => this.resource.isLoading());
  readonly total = computed(() => resourceValue(this.resource)?.total ?? 0);
  readonly packageList = computed<Package[]>(() =>
    (resourceValue(this.resource)?.items ?? []).filter((pkg) => pkg.version),
  );

  setSearch(value: string): void {
    // A new search invalidates the current offset; a stale persisted table
    // position would otherwise request a page beyond the filtered results.
    this.pagination.resetPage();
    this.searchValue.set(value);
  }

  setRepoFilter(repoName: string | null | undefined): void {
    this.repoName.set(repoName ?? undefined);
    this.pagination.resetPage();
  }

  setSort(field: string, order: number): void {
    this.sortField.set(isPackageSortField(field) ? field : DEFAULT_SORT_FIELD);
    this.sortOrder.set(order);
  }
}
