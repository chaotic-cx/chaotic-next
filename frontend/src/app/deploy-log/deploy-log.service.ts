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
import { ActivatedRoute } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';

export const REPO_OPTIONS = ['chaotic-aur', 'garuda'];

const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_OPTIONS: { label: string; value: BuildStatus; icon: string }[] = [
  { label: STATUS_LABELS[BuildStatus.SUCCESS], value: BuildStatus.SUCCESS, icon: 'pi-check-circle text-ctp-green' },
  {
    label: STATUS_LABELS[BuildStatus.ALREADY_BUILT],
    value: BuildStatus.ALREADY_BUILT,
    icon: 'pi-check text-ctp-sapphire',
  },
  {
    label: STATUS_LABELS[BuildStatus.SKIPPED],
    value: BuildStatus.SKIPPED,
    icon: 'pi-angle-double-right text-ctp-text',
  },
  { label: STATUS_LABELS[BuildStatus.FAILED], value: BuildStatus.FAILED, icon: 'pi-exclamation-circle text-ctp-red' },
  { label: STATUS_LABELS[BuildStatus.TIMED_OUT], value: BuildStatus.TIMED_OUT, icon: 'pi-hourglass text-ctp-maroon' },
  { label: STATUS_LABELS[BuildStatus.CANCELED], value: BuildStatus.CANCELED, icon: 'pi-ban text-ctp-peach' },
  {
    label: STATUS_LABELS[BuildStatus.CANCELED_REQUEUE],
    value: BuildStatus.CANCELED_REQUEUE,
    icon: 'pi-replay text-ctp-yellow',
  },
  {
    label: STATUS_LABELS[BuildStatus.SOFTWARE_FAILURE],
    value: BuildStatus.SOFTWARE_FAILURE,
    icon: 'pi-exclamation-triangle text-ctp-blue',
  },
];

const DEFAULT_SORT_FIELD: BuildSortField = 'timestamp';

const STATUS_BY_LABEL = new Map(
  Object.entries(STATUS_LABELS).map(([key, label]) => [label, Number(key) as BuildStatus]),
);

@Service()
export class DeployLogService {
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);

  readonly page = signal<number>(1);
  readonly perPage = signal<number>(25);
  readonly sortField = signal<BuildSortField>(DEFAULT_SORT_FIELD);
  readonly sortOrder = signal<number>(-1);

  readonly repoOptions = REPO_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;

  readonly builderFilter = signal<string | undefined>(this.route.snapshot.queryParamMap.get('builder') ?? undefined);
  readonly repoFilter = signal<string | undefined>(this.route.snapshot.queryParamMap.get('repo') ?? undefined);
  readonly statusFilter = signal<BuildStatus | undefined>(
    STATUS_BY_LABEL.get(this.route.snapshot.queryParamMap.get('status') ?? ''),
  );

  readonly searchValue = signal<string>(this.route.snapshot.queryParamMap.get('search') ?? '');
  private readonly qDebounced = signal<string>(this.route.snapshot.queryParamMap.get('search') ?? '');
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

  statusByLabel(label: string | undefined): BuildStatus | undefined {
    return label ? STATUS_BY_LABEL.get(label) : undefined;
  }

  reload(): void {
    this.resource.reload();
  }
}
