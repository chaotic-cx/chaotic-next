import { HttpClient, HttpParams, type HttpResourceRequest } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import {
  type BuildSortField,
  type BuildStatus,
  type ChaoticEvent,
  aurSearchQuerySchema,
  daysQuerySchema,
  daysRepoQuerySchema,
  getBuildsQuerySchema,
  getPackagesQuerySchema,
  MAX_PER_PAGE,
  pkgnameListQuerySchema,
  popularBuildsQuerySchema,
  repoQuerySchema,
  type Paginated,
  type Package,
  type PackageSortField,
  type SortOrder,
} from '@chaotic-next/shared-lib';
import { firstValueFrom, lastValueFrom, Subject } from 'rxjs';
import { APP_CONFIG } from '../environments/app-config.token';
import { type EnvironmentModel } from '../environments/environment.model';
import { type ResourceMetricKey } from './stats/charts/chart-resource-metrics';
import { isChaoticEvent } from './functions';
import { ResilientSseStream, SSE_RECONNECT_DELAY_MS } from './sse-stream';
import { parseQueryParams } from './utils/api-params';

export interface PackagesQueryParams {
  page: number;
  perPage: number;
  q?: string;
  sort?: PackageSortField;
  order?: SortOrder;
  repoId?: number;
}

export interface BuildsQueryParams {
  page: number;
  perPage: number;
  q?: string;
  builder?: string[];
  repo?: string;
  status?: BuildStatus[];
  sort?: BuildSortField;
  order?: SortOrder;
}

export const ALL_TIME_DAYS = 3650;

/** The backend emits a heartbeat every 15s; three missed ones mean a dead link. */
const SSE_HEARTBEAT_MS = 15_000;
const SSE_STALE_AFTER_MS = 3 * SSE_HEARTBEAT_MS;
const WATCHDOG_TICK_MS = 5_000;
/** Minimum gap between health probes; errors reconnect about once per second. */
const HEALTH_PROBE_MIN_GAP_MS = 5_000;

@Service()
export class AppService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);

  chaoticSse$ = new Subject<ChaoticEvent>();
  chaoticEvent = this.chaoticSse$.asObservable();

  private readonly internalSseConnected = signal(false);
  readonly sseConnected = this.internalSseConnected.asReadonly();

  private readonly internalSseSettled = signal(false);
  readonly sseSettled = this.internalSseSettled.asReadonly();

  readonly backendVersion = signal<string | undefined>(undefined);

  private lastSseFrameAt = Date.now();
  private lastHealthProbeAt = 0;
  private readonly watchdogTimer = setInterval(() => this.watchdogTick(), WATCHDOG_TICK_MS);
  private readonly stream = new ResilientSseStream({
    url: () => `${this.appConfig.backendUrl}/sse?ngsw-bypass`,
    onMessage: (data) => this.handleFrame(data),
    namedEvents: ['ping'],
    onNamedEvent: () => {
      // The backend heartbeat is a named event, so it never reaches onmessage;
      // it is still proof of a live connection.
      this.lastSseFrameAt = Date.now();
      this.internalSseConnected.set(true);
    },
    onOpen: () => {
      this.lastSseFrameAt = Date.now();
      this.internalSseSettled.set(true);
      this.internalSseConnected.set(true);
    },
    onError: () => {
      this.internalSseSettled.set(true);
      void this.probeHealth();
    },
    maxAttempts: Number.MAX_SAFE_INTEGER,
    delayMs: SSE_RECONNECT_DELAY_MS,
  });

  constructor() {
    this.stream.open();
    this.fetchVersion();
  }

  /**
   * Detects half-open streams: the backend heartbeats every 15s, so an open
   * connection without frames for three intervals is dead without an error.
   * Force a reconnect (which either recovers or raises onerror) and judge the
   * backend by its health endpoint.
   */
  private watchdogTick(): void {
    if (!this.stream.isOpen) return;
    if (Date.now() - this.lastSseFrameAt <= SSE_STALE_AFTER_MS) return;
    void this.probeHealth();
    this.lastSseFrameAt = Date.now();
    this.stream.open();
  }

  /**
   * The health endpoint decides backend liveness; a failed probe flags the
   * backend down for the guard, a successful one keeps or restores the ok
   * state even while SSE is still reconnecting. A connected stream that still
   * delivers frames is its own liveness proof — probing while healthy would
   * only add request noise, so probes run only while down or stale.
   */
  private async probeHealth(): Promise<void> {
    if (this.internalSseConnected() && Date.now() - this.lastSseFrameAt <= SSE_STALE_AFTER_MS) return;
    if (Date.now() - this.lastHealthProbeAt < HEALTH_PROBE_MIN_GAP_MS) return;
    this.lastHealthProbeAt = Date.now();
    try {
      await firstValueFrom(this.http.get(`${this.appConfig.backendUrl}/health`));
      this.internalSseConnected.set(true);
    } catch {
      this.internalSseConnected.set(false);
    }
  }

  private handleFrame(data: string): void {
    this.lastSseFrameAt = Date.now();
    const event: unknown = JSON.parse(data);
    if (isChaoticEvent(event)) this.chaoticSse$.next(event);
  }

  private fetchVersion(): void {
    this.http.get<{ version: string }>(`${this.appConfig.backendUrl}/health/version`).subscribe({
      next: (res) => this.backendVersion.set(res.version),
      error: () => this.backendVersion.set('unknown'),
    });
  }

  private daysParams(days?: number): HttpParams {
    return new HttpParams({ fromObject: parseQueryParams(daysQuerySchema, { days: days ?? ALL_TIME_DAYS }) });
  }

  private daysRepoParams(days?: number, repo?: string): HttpParams {
    return new HttpParams({
      fromObject: parseQueryParams(daysRepoQuerySchema, { days: days ?? ALL_TIME_DAYS, repo }),
    });
  }

  private repoParams(repo?: string): HttpParams {
    return new HttpParams({ fromObject: parseQueryParams(repoQuerySchema, { repo }) });
  }

  getUsersResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/metrics/users`, params: this.daysParams(days) };
  }

  getUserAgentsResourceRequest(days?: number, repo?: string): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/metrics/user-agents`, params: this.daysRepoParams(days, repo) };
  }

  getCountryRanksResourceRequest(days?: number, repo?: string): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/metrics/rank/30/countries`,
      params: this.daysRepoParams(days, repo),
    };
  }

  getOverallPackageStatsResourceRequest(range: number, days?: number, repo?: string): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/metrics/rank/${range}/packages`,
      params: this.daysRepoParams(days, repo),
    };
  }

  getSpecificPackageMetricsResourceRequest(packageName: string, days?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/metrics/package/${packageName}`,
      params: this.daysParams(days),
    };
  }

  getBuildsPerDayResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/per-day/${days}` };
  }

  getPackageAdditionsResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/added/per-day/${days}` };
  }

  getAverageBuildTimePerDayResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/average/per-day/${days}` };
  }

  getTopFailedBuildsResourceRequest(amount: number, days?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/builds/failed/top/${amount}`,
      params: this.daysParams(days),
    };
  }

  getFailedBuildsOverTimeResourceRequest(amount: number, days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/builds/failed/over-time/${amount}/${days}` };
  }

  getUnresolvedFailedBuildsResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/builds/failed/unresolved`, params: this.daysParams(days) };
  }

  async silenceUnresolvedFailedBuild(pkgname: string): Promise<void> {
    await lastValueFrom(
      this.http.post(
        `${this.appConfig.backendUrl}/builder/builds/failed/unresolved/${encodeURIComponent(pkgname)}/silence`,
        {},
      ),
    );
  }

  async unsilenceUnresolvedFailedBuild(pkgname: string): Promise<void> {
    await lastValueFrom(
      this.http.delete(
        `${this.appConfig.backendUrl}/builder/builds/failed/unresolved/${encodeURIComponent(pkgname)}/silence`,
      ),
    );
  }

  getHeavyPackagesResourceRequest(amount: number, days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/heavy-packages/${amount}/${days}` };
  }

  getFlakiestPackagesResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/flaky-packages/${days}` };
  }

  getBuilderUtilizationResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/builder-utilization/${days}` };
  }

  getPackagesPerBuildClassRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/packages-per-build-class/${days}` };
  }

  getPkgbaseCompositionRequest(): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/pkgbase-composition` };
  }

  getHeavyPackagesByResourceRequest(metric: ResourceMetricKey, amount: number, days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/heavy-packages/resource/${metric}/${amount}/${days}` };
  }

  getPackageResourceStatsResourceRequest(pkgname: string, days: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/stats/resource/package/${encodeURIComponent(pkgname)}/${days}`,
    };
  }

  getThroughputResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/throughput/per-day/${days}` };
  }

  getUserAgentTrendResourceRequest(days: number, repo?: string): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/router/useragents/trend/${days}`,
      params: this.repoParams(repo),
    };
  }

  getMirrorStatsOverTimeResourceRequest(days: number, repo?: string): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/router/stats/mirror-over-time/${days}`,
      params: this.repoParams(repo),
    };
  }

  getCountryStatsOverTimeResourceRequest(days: number, repo?: string): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/router/stats/country-over-time/${days}`,
      params: this.repoParams(repo),
    };
  }

  getBuildersAmountResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/builders/amount`, params: this.daysParams(days) };
  }

  getAverageBuildTimeResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/average/time`, params: this.daysParams(days) };
  }

  getPackageAverageBuildTimesResourceRequest(
    pkgnames: string[],
    days?: number,
    builder?: string[],
  ): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/average/pkgname`,
      params: new HttpParams({
        fromObject: parseQueryParams(pkgnameListQuerySchema, { pkgname: pkgnames, builder, days }),
      }),
    };
  }

  getPopularPackagesResourceRequest(amount: number, days?: number, status?: BuildStatus): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/popular/${amount}`,
      params: new HttpParams({
        fromObject: parseQueryParams(popularBuildsQuerySchema, { days, status }),
      }),
    };
  }

  getBuildsCountByPkgnamePerDayResourceRequest(pkgname: string, days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/count/${pkgname}/${days}` };
  }

  getAverageBuildTimePerDayForPackageResourceRequest(pkgname: string, days: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/average/per-day/package/${encodeURIComponent(pkgname)}`,
      params: this.daysParams(days),
    };
  }

  getPackagesResourceRequest(params: PackagesQueryParams): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/packages`,
      params: new HttpParams({
        fromObject: parseQueryParams(getPackagesQuerySchema, { ...params, repo: 'true' }),
      }),
    };
  }

  /** Returns unique package names in `repo` that match `query`. */
  async fetchPkgnameSuggestions(query: string, repo: string): Promise<string[]> {
    const request = this.getPackagesResourceRequest({ page: 1, perPage: MAX_PER_PAGE, q: query });
    const result = await firstValueFrom(this.http.get<Paginated<Package>>(request.url, { params: request.params }));
    return [...new Set((result.items ?? []).filter((pkg) => pkg.reponame === repo).map((pkg) => pkg.pkgname))];
  }

  getBuildsResourceRequest(params: BuildsQueryParams): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/builds`,
      params: new HttpParams({ fromObject: parseQueryParams(getBuildsQuerySchema, params) }),
    };
  }

  getPackageResourceRequest(name: string, repo: string): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/package/${name}`, params: new HttpParams().set('repo', repo) };
  }

  getPackageRebuildTriggerSourcesResourceRequest(pkgname: string): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/repo/dependencies/${encodeURIComponent(pkgname)}` };
  }

  getStatusChecksResourceRequest(): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/gitlab/pipelines` };
  }

  getQueueStatsResourceRequest(): HttpResourceRequest {
    return { url: `${this.appConfig.apiUrl}/queue/stats` };
  }

  getPackageBuildsResourceRequest(perPage = 20, status?: BuildStatus): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/builder/builds`,
      params: new HttpParams({
        fromObject: parseQueryParams(getBuildsQuerySchema, {
          perPage,
          status: status === undefined ? undefined : [status],
        }),
      }),
    };
  }

  getMirrorsStatsResourceRequest(): HttpResourceRequest {
    return { url: this.appConfig.mirrorsUrl };
  }

  getRpsHistoryResourceRequest(): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/metrics/rps/history` };
  }

  getUpdateReviewStatsResourceRequest(timeRangeDays?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/gitlab/review-stats`,
      params: new HttpParams({ fromObject: parseQueryParams(daysQuerySchema, { days: timeRangeDays }) }),
    };
  }

  getUpdateReviewStatsOverTimeResourceRequest(timeRangeDays?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/gitlab/review-stats/over-time`,
      params: new HttpParams({ fromObject: parseQueryParams(daysQuerySchema, { days: timeRangeDays }) }),
    };
  }

  getAurSuggestions(query: string): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/gitlab/aur-search`,
      params: new HttpParams({ fromObject: parseQueryParams(aurSearchQuerySchema, { arg: query }) }),
    };
  }
}
