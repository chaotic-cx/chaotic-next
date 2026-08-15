import { isPackageSortField, type PackageSortField, Package, Paginated } from '@chaotic-next/shared-lib';
import { httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject } from 'rxjs';
import { AppService } from '../app.service';

const DEFAULT_SORT_FIELD: PackageSortField = 'pkgname';

@Service()
export class PackageListService {
  private readonly appService = inject(AppService);

  readonly page = signal<number>(1);
  readonly perPage = signal<number>(25);
  readonly sortField = signal<PackageSortField>(DEFAULT_SORT_FIELD);
  readonly sortOrder = signal<number>(1);

  readonly searchValue = signal<string>('');
  private readonly qDebounced = signal<string>('');
  private readonly qSubject = new Subject<string>();

  private readonly resource = httpResource<Paginated<Package>>(() =>
    this.appService.getPackagesResourceRequest({
      page: this.page(),
      perPage: this.perPage(),
      q: this.qDebounced() || undefined,
      sort: this.sortField(),
      order: this.sortOrder() === 1 ? 'ASC' : 'DESC',
    }),
  );

  readonly loading = computed(() => this.resource.isLoading());
  readonly total = computed(() => this.resource.value()?.total ?? 0);
  readonly packageList = computed<Package[]>(() => (this.resource.value()?.items ?? []).filter((pkg) => pkg.version));

  constructor() {
    this.qSubject.pipe(debounceTime(300), takeUntilDestroyed()).subscribe((q) => this.qDebounced.set(q));
  }

  /** Update the global search query (debounced) and the bound input value. */
  setSearch(value: string): void {
    this.searchValue.set(value);
    this.qSubject.next(value);
  }

  /** Update pagination from the table's lazy load event. */
  setPage(first: number, rows: number): void {
    this.page.set(Math.floor(first / rows) + 1);
    this.perPage.set(rows);
  }

  /** Update sorting from the table's lazy load event. */
  setSort(field: string, order: number): void {
    this.sortField.set(isPackageSortField(field) ? field : DEFAULT_SORT_FIELD);
    this.sortOrder.set(order);
  }
}
