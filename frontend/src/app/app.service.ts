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
import { type SeoTags, updateSeoTags } from './functions';

export interface PackagesQueryParams {
  page: number;
  perPage: number;
  q?: string;
  sort?: PackageSortField;
  order?: SortOrder;
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

@Service()
export class AppService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);

  /**
   * Channel for instant updates regarding builds and pipeline status
   */
  serverEvents: EventSource = new EventSource(`${this.appConfig.backendUrl}/sse?ngsw-bypass`);

  /**
   * Subject for SSE notifications
   */
  chaoticSse$ = new Subject<ChaoticEvent>();
  chaoticEvent = this.chaoticSse$.asObservable();

  getNewsResourceRequest(): HttpResourceRequest {
    return { url: '/news.json' };
  }

  private daysParams(days?: number): HttpParams {
    let params = new HttpParams();
    if (days !== undefined) params = params.set('days', days.toString());
    return params;
  }

  getUsersResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.cachedMetricsUrl}/users`, params: this.daysParams(days) };
  }

  getUserAgentsResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.cachedMetricsUrl}/user-agents`, params: this.daysParams(days) };
  }

  getCountryRanksResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.cachedMetricsUrl}/rank/30/countries`, params: this.daysParams(days) };
  }

  getOverallPackageStatsResourceRequest(range: number, days?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.cachedMetricsUrl}/rank/${range}/packages`,
      params: this.daysParams(days),
    };
  }

  getSpecificPackageMetricsResourceRequest(packageName: string, days?: number): HttpResourceRequest {
    return {
      url: `${this.appConfig.cachedMetricsUrl}/package/${packageName}`,
      params: this.daysParams(days),
    };
  }

  getBuildsPerDayResourceRequest(days: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/per-day/${days}` };
  }

  getBuildersAmountResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/builders/amount`, params: this.daysParams(days) };
  }

  getAverageBuildTimeResourceRequest(days?: number): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/builder/average/time`, params: this.daysParams(days) };
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

  getUpdateReviewStatsResourceRequest(): HttpResourceRequest {
    return { url: `${this.appConfig.backendUrl}/gitlab/review-stats` };
  }
}
