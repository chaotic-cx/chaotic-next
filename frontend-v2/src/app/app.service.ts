import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  type Build,
  type BuildStatus,
  type CountryRankList,
  type Package,
  type PackageRankList,
  type PipelineWithExternalStatus,
  type SpecificPackageMetrics,
  type StatsObject,
  type TgMessageList,
  type UserAgentList,
} from '@./shared-lib';
import { APP_CONFIG } from '../environments/app-config.token';
import { type EnvironmentModel } from '../environments/environment.model';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);

  getStatusChecks(): Observable<PipelineWithExternalStatus[]> {
    return this.http.get<PipelineWithExternalStatus[]>(`${this.appConfig.backendUrl}/gitlab/pipelines`);
  }

  getQueueStats(): Observable<StatsObject> {
    return this.http.get<StatsObject>(`${this.appConfig.apiUrl}/queue/stats`);
  }

  getNews(): Observable<TgMessageList> {
    return this.http.get<TgMessageList>(`${this.appConfig.tgApiUrl}/news`);
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

  getPackageList(): Observable<Package[]> {
    return this.http.get<Package[]>(`${this.appConfig.backendUrl}/builder/packages`);
  }

  getPackage(name: string): Observable<Package> {
    return this.http.get<Package>(`${this.appConfig.backendUrl}/builder/package/${name}`);
  }

  getPackageBuilds(amount: number, status?: BuildStatus): Observable<Build[]> {
    let params: { [key: string]: string } = { amount: amount.toString() };
    if (status) params['status'] = status.toString();

    return this.http.get<Build[]>(`${this.appConfig.backendUrl}/builder/builds`, {
      params,
    });
  }
}