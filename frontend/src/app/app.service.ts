import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  type Build,
  type Builder,
  type BuildStatus,
  type ChaoticEvent,
  type CountryRankList,
  MirrorData,
  type Package,
  type PackageRankList,
  type PipelineWithExternalStatus,
  type Repo,
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
  serverEvents: EventSource = new EventSource(`${this.appConfig.backendUrl}/sse?ngsw-bypass`);

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

  getPackage(name: string, repo: string): Observable<Package> {
    return this.http.get<Package>(`${this.appConfig.backendUrl}/builder/package/${name}`, {
      params: { repo },
    });
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

  getUpdateReviewStats(): Observable<{ username: string; reviews: number }[]> {
    return this.http.get<{ username: string; reviews: number }[]>(`${this.appConfig.backendUrl}/gitlab/review-stats`);
  }

  // Builder API methods
  getBuilders(): Observable<Builder[]> {
    return this.http.get<Builder[]>(`${this.appConfig.backendUrl}/builder/builders`);
  }

  getRepos(): Observable<Repo[]> {
    return this.http.get<Repo[]>(`${this.appConfig.backendUrl}/builder/repos`);
  }

  getLatestBuilds(amount = 50, offset = 0, status?: BuildStatus): Observable<Build[]> {
    const params: { [key: string]: string } = { amount: amount.toString(), offset: offset.toString() };
    if (status !== undefined) params['status'] = status.toString();
    return this.http.get<Build[]>(`${this.appConfig.backendUrl}/builder/latest`, { params });
  }

  getLatestBuildsByPkgname(pkgname: string, offset = 0, amount = 30): Observable<Build[]> {
    const params: { [key: string]: string } = { offset: offset.toString(), amount: amount.toString() };
    return this.http.get<Build[]>(`${this.appConfig.backendUrl}/builder/latest/${pkgname}`, { params });
  }

  getLatestBuildsByPkgnameWithAmount(pkgname: string, days: number, offset = 0): Observable<Build[]> {
    const params: { [key: string]: string } = { offset: offset.toString() };
    return this.http.get<Build[]>(`${this.appConfig.backendUrl}/builder/latest/${pkgname}/${days}`, { params });
  }

  getBuildsPerPackage(): Observable<{ pkgbase: string; count: string }[]> {
    return this.http.get<{ pkgbase: string; count: string }[]>(`${this.appConfig.backendUrl}/builder/count/days`);
  }

  getBuildsPerPackageWithDays(days: number): Observable<{ pkgbase: string; count: string }[]> {
    return this.http.get<{ pkgbase: string; count: string }[]>(
      `${this.appConfig.backendUrl}/builder/count/days/${days}`,
    );
  }

  getLatestBuildsCountByPkgname(pkgname: string): Observable<number> {
    return this.http.get<number>(`${this.appConfig.backendUrl}/builder/count/package/${pkgname}`);
  }

  getBuildsCountByPkgnamePerDay(
    pkgname: string,
    amount = 50,
    offset = 0,
  ): Observable<{ day: string; repo: string; count: string }[]> {
    const params: { [key: string]: string } = { offset: offset.toString(), amount: amount.toString() };
    return this.http.get<{ day: string; repo: string; count: string }[]>(
      `${this.appConfig.backendUrl}/builder/count/${pkgname}/${amount}`,
      { params },
    );
  }

  getPopularPackages(
    amount: number,
    offset = 0,
    status?: BuildStatus,
  ): Observable<{ pkgbase_pkgname: string; count: string }[]> {
    const params: { [key: string]: string } = { offset: offset.toString() };
    if (status !== undefined) params['status'] = status.toString();
    return this.http.get<{ pkgbase_pkgname: string; count: string }[]>(
      `${this.appConfig.backendUrl}/builder/popular/${amount}`,
      { params },
    );
  }

  getBuildersAmount(): Observable<{ name: string; count: string }[]> {
    return this.http.get<{ name: string; count: string }[]>(`${this.appConfig.backendUrl}/builder/builders/amount`);
  }

  getBuildsPerDayDefault(
    pkgname: string,
    days: number,
    offset = 0,
  ): Observable<{ day: string; repo: string; count: string }[]> {
    const params: { [key: string]: string } = { offset: offset.toString() };
    return this.http.get<{ day: string; repo: string; count: string }[]>(
      `${this.appConfig.backendUrl}/builder/per-day/pkgname/${pkgname}/${days}`,
      { params },
    );
  }

  getBuildsPerDay(days: number): Observable<{ day: string; count: string }[]> {
    return this.http.get<{ day: string; count: string }[]>(`${this.appConfig.backendUrl}/builder/per-day/${days}`);
  }

  getLatestBuildsByPkgnameWithUrls(
    amount = 50,
    offset = 0,
  ): Observable<{ commit: string; logUrl: string; pkgname: string; timeToEnd: string; version: string }[]> {
    const params: { [key: string]: string } = { offset: offset.toString(), amount: amount.toString() };
    return this.http.get<{ commit: string; logUrl: string; pkgname: string; timeToEnd: string; version: string }[]>(
      `${this.appConfig.backendUrl}/builder/latest/url/${amount}`,
      { params },
    );
  }

  getAverageBuildTimePerStatus(): Observable<{ average_build_time: string; status: string }[]> {
    return this.http.get<{ average_build_time: string; status: string }[]>(
      `${this.appConfig.backendUrl}/builder/average/time`,
    );
  }
}
