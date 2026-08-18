import { httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { isPackageSortField, Package, type PackageSortField, Paginated, Repo } from '@chaotic-next/shared-lib';
import { AppService } from '../app.service';
import { resourceSignal, resourceValue } from '../functions';

const DEFAULT_SORT_FIELD: PackageSortField = 'pkgname';

@Service()
export class PackageListService {
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);

  readonly page = signal<number>(1);
  readonly perPage = signal<number>(25);
  readonly sortField = signal<PackageSortField>(DEFAULT_SORT_FIELD);
  readonly sortOrder = signal<number>(1);

  readonly repoName = signal<string | undefined>(this.route.snapshot.queryParamMap.get('repo') ?? undefined);
  readonly repoFilter = computed<number | undefined>(
    () => this.repos()?.find((repo) => repo.name === this.repoName())?.id,
  );

  readonly searchValue = signal<string>(this.route.snapshot.queryParamMap.get('search') ?? '');

  private readonly reposResource = httpResource<Repo[]>(() =>
    this.appService.getBackendUrl() ? `${this.appService.getBackendUrl()}/builder/repos` : undefined,
  );
  readonly repos = resourceSignal(this.reposResource);

  private readonly resource = httpResource<Paginated<Package>>(() => {
    if (this.repoName() && !this.repos()) return undefined;
    return this.appService.getPackagesResourceRequest({
      page: this.page(),
      perPage: this.perPage(),
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
    this.searchValue.set(value);
  }

  setRepoFilter(repoName: string | null | undefined): void {
    this.repoName.set(repoName ?? undefined);
    this.page.set(1);
  }

  setPage(first: number, rows: number): void {
    this.page.set(Math.floor(first / rows) + 1);
    this.perPage.set(rows);
  }

  setSort(field: string, order: number): void {
    this.sortField.set(isPackageSortField(field) ? field : DEFAULT_SORT_FIELD);
    this.sortOrder.set(order);
  }
}
