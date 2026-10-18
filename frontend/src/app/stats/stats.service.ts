import { Service, signal } from '@angular/core';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { REPO_OPTIONS } from '../deploy-log/deploy-log.service';

export const STATS_TABS = [
  'search',
  'globals',
  'downloads',
  'update-review',
  'builder-stats',
  'resource-usage',
  'additions',
  'insights',
] as const;
export type StatsTab = (typeof STATS_TABS)[number];

export function isStatsTab(value: string): value is StatsTab {
  return (STATS_TABS as readonly string[]).includes(value);
}

export interface TimeRange {
  labelKey: string;
  days: number | null;
}

const TIME_RANGES: TimeRange[] = [
  { labelKey: marker('stats.timeRanges.days7'), days: 7 },
  { labelKey: marker('stats.timeRanges.days30'), days: 30 },
  { labelKey: marker('stats.timeRanges.days90'), days: 90 },
  { labelKey: marker('stats.timeRanges.months6'), days: 180 },
  { labelKey: marker('stats.timeRanges.years1'), days: 365 },
  { labelKey: marker('stats.timeRanges.years2'), days: 730 },
  { labelKey: marker('common.all'), days: null },
];

@Service()
export class StatsService {
  readonly totalUsers = signal<number | null>(null);
  readonly usersLoading = signal<boolean>(true);

  readonly timeRangeOptions = TIME_RANGES;

  readonly selectedRepo = signal<string>('');

  isValidRepo(value: string): boolean {
    return value === '' || REPO_OPTIONS.includes(value);
  }

  readonly timeRangeDays = signal<number | null>(TIME_RANGES[1].days);

  readonly countryRanksRange = signal<number>(15);

  readonly globalPackageMetricRange = signal<number>(20);

  readonly userAgentMetricRange = signal<number>(50);

  readonly packageSearchSelectedRepo = signal<string>('chaotic-aur');
}
