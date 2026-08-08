import { CountryRankList, Package, type PackageRankList, type UserAgentList } from '@./shared-lib';
import { Service, signal } from '@angular/core';

@Service()
export class StatsService {
  readonly currentTab = signal<string>('0');
  readonly totalUsers = signal<string>("<i class='text-ctp-maroon pi pi-hourglass'></i>");

  readonly countryRanksMetrics = signal<CountryRankList>([]);
  readonly countryRanksRange = signal<number>(15);

  readonly globalPackageMetrics = signal<PackageRankList>([]);
  readonly globalPackageMetricRange = signal<number>(50);

  readonly userAgentMetrics = signal<UserAgentList>([]);
  readonly userAgentMetricRange = signal<number>(50);

  readonly packageSearchData = signal<{ key: string; value: any }[]>([]);
  readonly packageSearchSuggestionPool = signal<string[]>([]);
  readonly packageSearchCurrentSuggestions = signal<string[]>([]);
  readonly packageSearchInitialSearchDone = signal<boolean>(false);
  readonly packageSearchPackageData = signal<Package | null>(null);
  readonly packageSearchSelectedRepo = signal<string>('chaotic-aur');

  readonly reviewStats = signal<{ username: string; reviews: number }[]>([]);
}
