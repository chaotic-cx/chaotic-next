import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  type Build,
  type BuildStatus,
  type ChaoticEvent,
  type CountryRankList,
  MirrorData,
  type Package,
  type PackageRankList,
  type PipelineWithExternalStatus,
  type SpecificPackageMetrics,
  type StatsObject,
  type UserAgentList,
} from '@./shared-lib';
import { APP_CONFIG } from '../environments/app-config.token';
import { type EnvironmentModel } from '../environments/environment.model';
import { Meta } from '@angular/platform-browser';
import { updateSeoTags } from './functions';
import { Message } from './newsfeed/interfaces';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);

  /**
   * Channel for instant updates regarding builds and pipeline status
   */
  serverEvents: EventSource = new EventSource(`${this.appConfig.backendUrl}/sse`);

  /**
   * Subject for SSE notifications
   */
  chaoticSse$ = new Subject<ChaoticEvent>();
  chaoticEvent = this.chaoticSse$.asObservable();

  getStatusChecks(): Observable<PipelineWithExternalStatus[]> {
    return this.http.get<PipelineWithExternalStatus[]>(`${this.appConfig.backendUrl}/gitlab/pipelines`);
  }

  getQueueStats(): Observable<StatsObject> {
    return this.http.get<StatsObject>(`${this.appConfig.apiUrl}/queue/stats`);
  }

  getNews(): Observable<Message[]> {
    return this.http.get<Message[]>(`/news.json`);
  }

  get30dayUsers(): Observable<string> {
    return this.http.get<string>(`${this.appConfig.cachedMetricsUrl}/30d/users`);
  }

  getOverallPackageStats(packageMetricRange: number): Observable<PackageRankList> {
    return this.http.get<PackageRankList>(`${this.appConfig.cachedMetricsUrl}/30d/rank/${packageMetricRange}/packages`);
  }

  getSpecificPackageMetrics(packageName: string): Observable<SpecificPackageMetrics> {
    return this.http.get<SpecificPackageMetrics>(`${this.appConfig.cachedMetricsUrl}/30d/package/${packageName}`);
  }

  get30dayUserAgents(): Observable<UserAgentList> {
    return this.http.get<UserAgentList>(`${this.appConfig.cachedMetricsUrl}/30d/user-agents`);
  }

  getCountryRanks(): Observable<CountryRankList> {
    return this.http.get<CountryRankList>(`${this.appConfig.cachedMetricsUrl}/30d/rank/30/countries`);
  }

  getPackageList(): Observable<(Package & { reponame: string })[]> {
    return this.http.get<(Package & { reponame: string })[]>(`${this.appConfig.backendUrl}/builder/packages?repo=true`);
  }

  getPackage(name: string): Observable<Package> {
    return this.http.get<Package>(`${this.appConfig.backendUrl}/builder/package/${name}`);
  }

  getPackageBuilds(amount: number, status?: BuildStatus): Observable<Build[]> {
    const params: { [key: string]: string } = { amount: amount.toString() };
    if (status) params['status'] = status.toString();

    return this.http.get<Build[]>(`${this.appConfig.backendUrl}/builder/builds`, {
      params,
    });
  }

  /**
   * Update the meta tags for the current page.
   */
  updateSeoTags(meta: Meta, title: string, description: string, keywords: string, url: string, image?: string): void {
    updateSeoTags(meta, title, description, keywords, url, image);
  }

  getMirrorsStats(): Observable<MirrorData> {
    return this.http.get<MirrorData>(this.appConfig.mirrorsUrl);
  }
}
