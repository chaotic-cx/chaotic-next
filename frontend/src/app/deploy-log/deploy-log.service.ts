import {
  Build,
  Builder,
  BuildStatus,
  isBuildSortField,
  Paginated,
  STATUS_LABELS,
  type BuildSortField,
} from '@chaotic-next/shared-lib';
import { httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject } from 'rxjs';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';

export const REPO_OPTIONS = ['chaotic-aur', 'garuda'];

const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_OPTIONS: { label: string; value: BuildStatus }[] = [
  { label: STATUS_LABELS[BuildStatus.SUCCESS], value: BuildStatus.SUCCESS },
  { label: STATUS_LABELS[BuildStatus.ALREADY_BUILT], value: BuildStatus.ALREADY_BUILT },
  { label: STATUS_LABELS[BuildStatus.SKIPPED], value: BuildStatus.SKIPPED },
  { label: STATUS_LABELS[BuildStatus.FAILED], value: BuildStatus.FAILED },
  { label: STATUS_LABELS[BuildStatus.TIMED_OUT], value: BuildStatus.TIMED_OUT },
  { label: STATUS_LABELS[BuildStatus.CANCELED], value: BuildStatus.CANCELED },
  { label: STATUS_LABELS[BuildStatus.CANCELED_REQUEUE], value: BuildStatus.CANCELED_REQUEUE },
  { label: STATUS_LABELS[BuildStatus.SOFTWARE_FAILURE], value: BuildStatus.SOFTWARE_FAILURE },
];

const DEFAULT_SORT_FIELD: BuildSortField = 'timestamp';

@Service()
export class DeployLogService {
  private readonly appService = inject(AppService);

  readonly page = signal<number>(1);
  readonly perPage = signal<number>(25);
  readonly sortField = signal<BuildSortField>(DEFAULT_SORT_FIELD);
  readonly sortOrder = signal<number>(-1);

  readonly repoOptions = REPO_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;

  readonly pkgnameFilter = signal<string>('');
  readonly builderFilter = signal<string | undefined>(undefined);
  readonly repoFilter = signal<string | undefined>(undefined);
  readonly statusFilter = signal<BuildStatus | undefined>(undefined);

  readonly searchValue = signal<string>('');
  private readonly qDebounced = signal<string>('');
  private readonly qSubject = new Subject<string>();

  private readonly buildersResource = httpResource<Builder[]>(
    () => `${this.appService.getBackendUrl()}/builder/builders`,
  );
  readonly builderOptions = computed<string[]>(() =>
    (resourceValue(this.buildersResource) ?? []).map((builder) => builder.name),
  );

  private readonly resource = httpResource<Paginated<Build>>(() =>
    this.appService.getBuildsResourceRequest({
      page: this.page(),
      perPage: this.perPage(),
      q: this.qDebounced() || undefined,
      builder: this.builderFilter(),
      repo: this.repoFilter(),
      status: this.statusFilter(),
      sort: this.sortField(),
      order: this.sortOrder() === 1 ? 'ASC' : 'DESC',
    }),
  );

  readonly loading = computed(() => this.resource.isLoading());
  readonly total = computed(() => resourceValue(this.resource)?.total ?? 0);
  readonly packageList = computed<Build[]>(() =>
    (resourceValue(this.resource)?.items ?? []).map((build) => ({
      ...build,
      statusText: STATUS_LABELS[build.status],
      logUrl: new Date(build.timestamp).getTime() + LOG_RETENTION_MS < Date.now() ? 'purged' : build.logUrl,
    })),
  );

  constructor() {
    this.qSubject.pipe(debounceTime(300), takeUntilDestroyed()).subscribe((q) => this.qDebounced.set(q));
  }

  setSearch(value: string): void {
    this.searchValue.set(value);
    this.qSubject.next(value);
  }

  setPage(first: number, rows: number): void {
    this.page.set(Math.floor(first / rows) + 1);
    this.perPage.set(rows);
  }

  setSort(field: string, order: number): void {
    this.sortField.set(isBuildSortField(field) ? field : DEFAULT_SORT_FIELD);
    this.sortOrder.set(order);
  }

  setPkgnameFilter(pkgname?: string): void {
    this.pkgnameFilter.set(pkgname ?? '');
  }

  setBuilderFilter(value: string | null | undefined): void {
    this.builderFilter.set(value ?? undefined);
    this.page.set(1);
  }

  setRepoFilter(value: string | null | undefined): void {
    this.repoFilter.set(value ?? undefined);
    this.page.set(1);
  }

  setStatusFilter(value: BuildStatus | null | undefined): void {
    this.statusFilter.set(value ?? undefined);
    this.page.set(1);
  }

  clearPkgnameFilter(): void {
    this.pkgnameFilter.set('');
  }

  reload(): void {
    this.resource.reload();
  }
}
