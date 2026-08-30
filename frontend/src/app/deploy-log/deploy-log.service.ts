import { httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  Build,
  Builder,
  type BuildSortField,
  BuildStatus,
  isBuildSortField,
  Paginated,
  STATUS_LABELS,
} from '@chaotic-next/shared-lib';
import { APP_CONFIG } from '../../environments/app-config.token';
import { type EnvironmentModel } from '../../environments/environment.model';
import { AppService } from '../app.service';
import { isLogPurged, resourceValue } from '../functions';
import { createLazyTablePagination } from '../table-pagination';

export const REPO_OPTIONS = ['chaotic-aur', 'garuda'];

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
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);

  readonly pagination = createLazyTablePagination();
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

  private readonly buildersResource = httpResource<Builder[]>(() =>
    this.appConfig.backendUrl ? `${this.appConfig.backendUrl}/builder/builders` : undefined,
  );
  readonly builderOptions = computed<string[]>(() =>
    (resourceValue(this.buildersResource) ?? []).map((builder) => builder.name),
  );

  private readonly resource = httpResource<Paginated<Build>>(() =>
    this.appService.getBuildsResourceRequest({
      page: this.pagination.page(),
      perPage: this.pagination.perPage(),
      q: this.searchValue() || undefined,
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
      logUrl: isLogPurged(build.timestamp) ? 'purged' : build.logUrl,
    })),
  );

  setSearch(value: string): void {
    // A new search invalidates the current offset; a stale persisted table
    // position would otherwise request a page beyond the filtered results.
    this.pagination.resetPage();
    this.searchValue.set(value);
  }

  setSort(field: string, order: number): void {
    this.sortField.set(isBuildSortField(field) ? field : DEFAULT_SORT_FIELD);
    this.sortOrder.set(order);
  }

  setBuilderFilter(value: string | null | undefined): void {
    this.builderFilter.set(value ?? undefined);
    this.pagination.resetPage();
  }

  setRepoFilter(value: string | null | undefined): void {
    this.repoFilter.set(value ?? undefined);
    this.pagination.resetPage();
  }

  setStatusFilter(value: BuildStatus | null | undefined): void {
    this.statusFilter.set(value ?? undefined);
    this.pagination.resetPage();
  }

  statusByLabel(label: string | undefined): BuildStatus | undefined {
    return label ? STATUS_BY_LABEL.get(label) : undefined;
  }

  reload(): void {
    this.resource.reload();
  }
}
