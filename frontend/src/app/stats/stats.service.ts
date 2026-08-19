import { Service, signal } from '@angular/core';
import { REPO_OPTIONS } from '../deploy-log/deploy-log.service';

export const STATS_TABS = [
  'search',
  'globals',
  'downloads',
  'update-review',
  'builder-stats',
  'additions',
  'insights',
] as const;
export type StatsTab = (typeof STATS_TABS)[number];

export function isStatsTab(value: string): value is StatsTab {
  return (STATS_TABS as readonly string[]).includes(value);
}

interface TimeRange {
  label: string;
  days: number | null;
}

const TIME_RANGES: TimeRange[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
  { label: 'All', days: null },
];

@Service()
export class StatsService {
  readonly currentTab = signal<StatsTab>('search');
  readonly totalUsers = signal<number | null>(null);
  readonly usersLoading = signal<boolean>(true);

  readonly timeRangeOptions = TIME_RANGES;

  readonly repoOptions = REPO_OPTIONS;

  readonly timeRangeDays = signal<number | null>(TIME_RANGES[1].days);

  readonly countryRanksRange = signal<number>(15);

  readonly globalPackageMetricRange = signal<number>(50);

  readonly userAgentMetricRange = signal<number>(50);

  readonly packageSearchSelectedRepo = signal<string>('chaotic-aur');
}
