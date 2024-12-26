import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CAUR_API_URL,
  CAUR_BACKEND_URL,
  CAUR_CACHED_METRICS_URL,
  CAUR_REPO_API_URL,
  CAUR_TG_API_URL,
  type CountryRankList,
  GitLabPipeline,
  type PackageRankList,
  type PkgListRetObject,
  RepositoryList,
  SpecificPackageMetrics,
  type StatsObject,
  TgMessageList,
  type UserAgentList,
} from '@./shared-lib';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  constructor(private http: HttpClient) {}

  getPipelines(): Observable<GitLabPipeline[]> {
    return this.http.get<GitLabPipeline[]>(`${CAUR_REPO_API_URL}/pipelines`);
  }

  getQueueStats(): Observable<StatsObject> {
    return this.http.get<StatsObject>(`${CAUR_API_URL}/queue/stats`);
  }

  getDeployments(url: string, repo: RepositoryList): Observable<TgMessageList> {
    return this.http.get<TgMessageList>(url, { params: { repo: repo } });
  }

  getNews(): Observable<TgMessageList> {
    return this.http.get<TgMessageList>(`${CAUR_TG_API_URL}/news`);
  }

  get30dayUsers(): Observable<string> {
    return this.http.get<string>(`${CAUR_CACHED_METRICS_URL}/30d/users`);
  }

  getOverallPackageStats(packageMetricRange: number): Observable<PackageRankList> {
    return this.http.get<PackageRankList>(`${CAUR_CACHED_METRICS_URL}/30d/rank/${packageMetricRange}/packages`);
  }

  getSpecificPackageMetrics(packageName: string): Observable<SpecificPackageMetrics> {
    return this.http.get<SpecificPackageMetrics>(`${CAUR_CACHED_METRICS_URL}/30d/package/${packageName}`);
  }

  get30dayUserAgents(): Observable<UserAgentList> {
    return this.http.get<UserAgentList>(`${CAUR_CACHED_METRICS_URL}/30d/user-agents`);
  }

  getCountryRanks(): Observable<CountryRankList> {
    return this.http.get<CountryRankList>(`${CAUR_CACHED_METRICS_URL}/30d/rank/30/countries`);
  }

  getPkgList(): Observable<PkgListRetObject> {
    return this.http.get<PkgListRetObject>(`${CAUR_BACKEND_URL}/misc/pkglist`);
  }

  getPackageList(): Observable<any> {
    return this.http.get<any>(`${CAUR_BACKEND_URL}/builder/packages`);
  }
}
