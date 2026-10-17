import { marker } from '@jsverse/transloco-keys-manager/marker';

export type DatePrecision = 'day' | 'month';

export interface TimelineEntry {
  date: string;
  precision: DatePrecision;
  textKey: string;
}

export const BIRTHDAY_AGE = 8;

export const FOUNDING_YEAR = 2018;

const OCTOBER = 9;

export const BANNER_START = new Date(2026, OCTOBER, 17);

export const BANNER_END = new Date(2026, OCTOBER, 24);

export const TIMELINE: TimelineEntry[] = [
  { date: '2018-10-18', precision: 'day', textKey: marker('memorial.edition2026.timeline.founded') },
  { date: '2018-11-08', precision: 'day', textKey: marker('memorial.edition2026.timeline.infra1') },
  { date: '2019-01-09', precision: 'day', textKey: marker('memorial.edition2026.timeline.ipfs') },
  { date: '2019-03-13', precision: 'day', textKey: marker('memorial.edition2026.timeline.tkg') },
  { date: '2019-06-25', precision: 'day', textKey: marker('memorial.edition2026.timeline.architectures') },
  { date: '2019-07-26', precision: 'day', textKey: marker('memorial.edition2026.timeline.firstMirror') },
  { date: '2019-12-30', precision: 'day', textKey: marker('memorial.edition2026.timeline.zst') },
  { date: '2020-05-28', precision: 'day', textKey: marker('memorial.edition2026.timeline.interfere') },
  { date: '2020-06', precision: 'month', textKey: marker('memorial.edition2026.timeline.garuda') },
  { date: '2020-07-12', precision: 'day', textKey: marker('memorial.edition2026.timeline.toolbox') },
  { date: '2020-07-26', precision: 'day', textKey: marker('memorial.edition2026.timeline.infra1Death') },
  { date: '2020-12-12', precision: 'day', textKey: marker('memorial.edition2026.timeline.infra3') },
  { date: '2021-01-03', precision: 'day', textKey: marker('memorial.edition2026.timeline.ufscar') },
  { date: '2021-02-05', precision: 'day', textKey: marker('memorial.edition2026.timeline.router') },
  { date: '2021-02-18', precision: 'day', textKey: marker('memorial.edition2026.timeline.syncthing') },
  { date: '2021-07-14', precision: 'day', textKey: marker('memorial.edition2026.timeline.realtimeMetrics') },
  { date: '2021-09-03', precision: 'day', textKey: marker('memorial.edition2026.timeline.geoRouting') },
  { date: '2021-10-18', precision: 'day', textKey: marker('memorial.edition2026.timeline.memorial3') },
  { date: '2022-01-22', precision: 'day', textKey: marker('memorial.edition2026.timeline.dockerMirror') },
  { date: '2022-04-18', precision: 'day', textKey: marker('memorial.edition2026.timeline.ansible') },
  { date: '2022-06-23', precision: 'day', textKey: marker('memorial.edition2026.timeline.multiRepoRouter') },
  { date: '2022-08-01', precision: 'day', textKey: marker('memorial.edition2026.timeline.mirrorMap') },
  { date: '2023-03-04', precision: 'day', textKey: marker('memorial.edition2026.timeline.r2Cdn') },
  { date: '2023-03-27', precision: 'day', textKey: marker('memorial.edition2026.timeline.nyx') },
  { date: '2023-04-11', precision: 'day', textKey: marker('memorial.edition2026.timeline.pkgrelIncrementer') },
  { date: '2024-02-12', precision: 'day', textKey: marker('memorial.edition2026.timeline.infra4') },
  { date: '2024-04-08', precision: 'day', textKey: marker('memorial.edition2026.timeline.toolboxEnd') },
  { date: '2024-05-31', precision: 'day', textKey: marker('memorial.edition2026.timeline.chaoticNext') },
  { date: '2024-06', precision: 'month', textKey: marker('memorial.edition2026.timeline.homeMap') },
  { date: '2024-10-18', precision: 'day', textKey: marker('memorial.edition2026.timeline.memorial6') },
  { date: '2024-11', precision: 'month', textKey: marker('memorial.edition2026.timeline.repoManager') },
  { date: '2025-01-03', precision: 'day', textKey: marker('memorial.edition2026.timeline.primeng') },
  { date: '2025-11', precision: 'month', textKey: marker('memorial.edition2026.timeline.humanReview') },
  { date: '2026-05-02', precision: 'day', textKey: marker('memorial.edition2026.timeline.flyio') },
  { date: '2026-06-11', precision: 'day', textKey: marker('memorial.edition2026.timeline.highCaution') },
  { date: '2026-08', precision: 'month', textKey: marker('memorial.edition2026.timeline.optimus') },
  { date: '2026-09-04', precision: 'day', textKey: marker('memorial.edition2026.timeline.ghaBuilders') },
  { date: '2026-10', precision: 'month', textKey: marker('memorial.edition2026.timeline.uiRework') },
];
