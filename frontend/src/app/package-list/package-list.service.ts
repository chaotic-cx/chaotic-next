import { httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isPackageSortField, Package, type PackageSortField, Paginated, Repo } from '@chaotic-next/shared-lib';
import { debounceTime, Subject } from 'rxjs';
import { AppService } from '../app.service';
import { resourceSignal, resourceValue } from '../functions';

const DEFAULT_SORT_FIELD: PackageSortField = 'pkgname';

@Service()
export class PackageListService {
  private readonly appService = inject(AppService);

  readonly page = signal<number>(1);
  readonly perPage = signal<number>(25);
  readonly sortField = signal<PackageSortField>(DEFAULT_SORT_FIELD);
  readonly sortOrder = signal<number>(1);
  readonly repoFilter = signal<number | undefined>(undefined);

  readonly searchValue = signal<string>('');
  private readonly qDebounced = signal<string>('');
  private readonly qSubject = new Subject<string>();

  private readonly reposResource = httpResource<Repo[]>(() =>
    this.appService.getBackendUrl() ? `${this.appService.getBackendUrl()}/builder/repos` : undefined,
  );
  readonly repos = resourceSignal(this.reposResource);

  private readonly resource = httpResource<Paginated<Package>>(() =>
    this.appService.getPackagesResourceRequest({
      page: this.page(),
      perPage: this.perPage(),
      q: this.qDebounced() || undefined,
      sort: this.sortField(),
      order: this.sortOrder() === 1 ? 'ASC' : 'DESC',
      repoId: this.repoFilter(),
    }),
  );

  readonly loading = computed(() => this.resource.isLoading());
  readonly total = computed(() => resourceValue(this.resource)?.total ?? 0);
  readonly packageList = computed<Package[]>(() =>
    (resourceValue(this.resource)?.items ?? []).filter((pkg) => pkg.version),
  );

  constructor() {
    this.qSubject.pipe(debounceTime(300), takeUntilDestroyed()).subscribe((q) => this.qDebounced.set(q));
  }

  setSearch(value: string): void {
    this.searchValue.set(value);
    this.qSubject.next(value);
  }

  setRepoFilter(repoId: number | null | undefined): void {
    this.repoFilter.set(repoId ?? undefined);
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
