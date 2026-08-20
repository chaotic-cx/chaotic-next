import { HttpClient, HttpParams, type HttpResourceRequest } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import {
  type BuildSortField,
  type BuildStatus,
  type ChaoticEvent,
  type PackageSortField,
  type SortOrder,
} from '@chaotic-next/shared-lib';
import { Subject } from 'rxjs';
import { APP_CONFIG } from '../environments/app-config.token';
import { type EnvironmentModel } from '../environments/environment.model';
import { isChaoticEvent, type SeoTags, updateSeoTags } from './functions';

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
  builder?: string;
  repo?: string;
  status?: BuildStatus;
  sort?: BuildSortField;
  order?: SortOrder;
}

export const ALL_TIME_DAYS = 3650;

const SSE_RECONNECT_DELAY_MS = 1000;

@Service()
export class AppService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);

  chaoticSse$ = new Subject<ChaoticEvent>();
  chaoticEvent = this.chaoticSse$.asObservable();

  private eventSource: EventSource | undefined;
  private reconnectTimer: number | undefined;
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.reconnect();
  };

  constructor() {
    // Closing on error would permanently stop live updates: EventSource does not
    // auto-reconnect after an explicit close, and backgrounded tabs drop the
    // connection. Instead, re-establish the stream on error and on tab focus.
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.reconnect();
  }

  private reconnect(): void {
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      this.eventSource.close();
    }

    const source = new EventSource(`${this.appConfig.backendUrl}/sse?ngsw-bypass`);
    this.eventSource = source;

    source.onmessage = ({ data }) => {
      const event: unknown = JSON.parse(data);
      if (isChaoticEvent(event)) this.chaoticSse$.next(event);
    };

    source.onerror = () => {
      this.eventSource?.close();
      this.eventSource = undefined;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnect();
    }, SSE_RECONNECT_DELAY_MS);
  }

  getNewsResourceRequest(): HttpResourceRequest {
    return { url: '/news.json' };
  }

  private daysParams(days?: number): HttpParams {
    return new HttpParams().set('days', (days ?? ALL_TIME_DAYS).toString());
  }

  getUsersResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/metrics/users`, params: this.daysParams(days) };
  }

  getUserAgentsResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/metrics/user-agents`, params: this.daysParams(days) };
  }

  getCountryRanksResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/metrics/rank/30/countries`, params: this.daysParams(days) };
  }

  getOverallPackageStatsResourceRequest(range: number, days?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.backendUrl}/metrics/rank/${range}/packages`,
      params: this.daysParams(days),
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

  getTopFailedBuildsResourceRequest(amount: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/builds/failed/top/${amount}` };
  }

  getHeavyPackagesResourceRequest(amount: number, days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/stats/heavy-packages/${amount}/${days}` };
  }

  getThroughputResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/throughput/per-day/${days}` };
  }

  getUserAgentTrendResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/router/useragents/trend/${days}` };
  }

  getMirrorStatsOverTimeResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/router/stats/mirror-over-time/${days}` };
  }

  getCountryStatsOverTimeResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/router/stats/country-over-time/${days}` };
  }

  getBuildersAmountResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/builders/amount`, params: this.daysParams(days) };
  }

  getAverageBuildTimeResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/average/time`, params: this.daysParams(days) };
  }

  getPackageAverageBuildTimesResourceRequest(pkgnames: string[], days?: number): HttpResourceRequest {
    let params = this.daysParams(days);
    for (const pkgname of pkgnames) params = params.append('pkgname', pkgname);
    return { url: `${this.appConfig.backendUrl}/builder/average/pkgname`, params };
  }

  getPopularPackagesResourceRequest(amount: number, days?: number, status?: BuildStatus): HttpResourceRequest {
    let params = this.daysParams(days);
    if (status !== undefined) {
      params = params.set('status', status.toString());
    }
    return { url: `${this.appConfig.backendUrl}/builder/popular/${amount}`, params };
  }

  getBuildsCountByPkgnamePerDayResourceRequest(pkgname: string, days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/count/${pkgname}/${days}` };
  }

  getBackendUrl(): string {
    return this.appConfig.backendUrl;
  }

  getPackagesResourceRequest(params: PackagesQueryParams): HttpResourceRequest {
    let queryParams = new HttpParams()
      .set('repo', 'true')
      .set('page', params.page.toString())
      .set('perPage', params.perPage.toString());
    if (params.q) queryParams = queryParams.set('q', params.q);
    if (params.sort) queryParams = queryParams.set('sort', params.sort);
    if (params.order) queryParams = queryParams.set('order', params.order);
    if (params.repoId !== undefined) queryParams = queryParams.set('repoId', params.repoId.toString());
    return { url: `${this.appConfig.backendUrl}/builder/packages`, params: queryParams };
  }

  getBuildsResourceRequest(params: BuildsQueryParams): HttpResourceRequest {
    let queryParams = new HttpParams().set('page', params.page.toString()).set('perPage', params.perPage.toString());
    if (params.q) queryParams = queryParams.set('q', params.q);
    if (params.builder) queryParams = queryParams.set('builder', params.builder);
    if (params.repo) queryParams = queryParams.set('repo', params.repo);
    if (params.status !== undefined) queryParams = queryParams.set('status', params.status.toString());
    if (params.sort) queryParams = queryParams.set('sort', params.sort);
    if (params.order) queryParams = queryParams.set('order', params.order);
    return { url: `${this.appConfig.backendUrl}/builder/builds`, params: queryParams };
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
    let params: HttpParams = new HttpParams().set('perPage', perPage.toString());
    if (status !== undefined) params = params.set('status', status.toString());
    return { url: `${this.appConfig.backendUrl}/builder/builds`, params };
  }

  updateSeoTags(meta: Meta, seo: SeoTags): void {
    updateSeoTags(meta, seo);
  }

  getMirrorsStatsResourceRequest(): HttpResourceRequest {
    return { url: this.appConfig.mirrorsUrl };
  }

  getUpdateReviewStatsResourceRequest(timeRangeDays?: number): HttpResourceRequest {
    const url = new URL(`${this.appConfig.backendUrl}/gitlab/review-stats`);
    if (timeRangeDays !== undefined) {
      url.searchParams.set('days', timeRangeDays.toString());
    }
    return { url: url.toString() };
  }

  getUpdateReviewStatsOverTimeResourceRequest(timeRangeDays?: number): HttpResourceRequest {
    const url = new URL(`${this.appConfig.backendUrl}/gitlab/review-stats/over-time`);
    if (timeRangeDays !== undefined) {
      url.searchParams.set('days', timeRangeDays.toString());
    }
    return { url: url.toString() };
  }
}
