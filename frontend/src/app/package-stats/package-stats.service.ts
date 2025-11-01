import { Injectable, signal } from '@angular/core';
import { CountryRankList, type PackageRankList, type UserAgentList } from '@./shared-lib';

@Injectable({
  providedIn: 'root',
})
export class PackageStatsService {
  readonly currentTab = signal<string>('0');
  readonly totalUsers = signal<string>("<i class='text-ctp-maroon pi pi-hourglass'></i>");

  readonly countryRanksMetrics = signal<CountryRankList>([]);
  readonly countryRanksRange = signal<number>(15);

  readonly globalPackageMetrics = signal<PackageRankList>([]);
  readonly globalPackageMetricRange = signal<number>(50);
  readonly globalPackageProgressbarValues = signal<{ value: number; label: string; count: number }[]>([]);

  readonly userAgentMetrics = signal<UserAgentList>([]);
  readonly userAgentMetricRange = signal<number>(50);
}
