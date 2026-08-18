import { formatDuration } from '../functions';

const MS_PER_MINUTE = 60_000;
const SECONDS_PER_MINUTE = 60;

/** Average build duration of a package in minutes, undefined when unknown. */
export type AverageLookup = (pkgname: string) => number | undefined;

export interface PackageBuildAverage {
  pkgname: string;
  averageMinutes: number;
  samples: number;
}

/** Sample-weighted mean across packages; fallback for packages without history. */
export function overallAverageMinutes(entries: PackageBuildAverage[]): number | undefined {
  let weighted = 0;
  let samples = 0;
  for (const entry of entries) {
    weighted += entry.averageMinutes * entry.samples;
    samples += entry.samples;
  }
  return samples > 0 ? weighted / samples : undefined;
}

export interface ActiveBuildInput {
  pkgname: string;
  /** When the build was first seen running; wall-clock ms. */
  startedMs: number;
  buildClass: number | string | null;
}

export interface WaitingBuildInput {
  pkgname: string;
  buildClass: number | string | null;
}

export interface IdleBuilderInput {
  buildClass: number | string | null;
}

export interface QueueEstimatesInput {
  active: ActiveBuildInput[];
  /** Waiting packages in queue order. */
  waiting: WaitingBuildInput[];
  idle: IdleBuilderInput[];
  nowMs: number;
  avgOf: AverageLookup;
}

/** Strings match exactly, numbers accept anything smaller-or-equal; null is unrestricted. */
function canPickUp(builder: number | string | null, build: number | string | null): boolean {
  if (build === null || builder === null) return true;
  if (typeof builder === 'string' || typeof build === 'string') return builder === build;
  return build <= builder;
}

interface Builder {
  freeMinutes: number;
  buildClass: number | string | null;
}

export interface QueueEstimates {
  /** Remaining minutes per active package. */
  activeFinish: Map<string, number>;
  /** Minutes until each waiting package starts building. */
  waitingStart: Map<string, number>;
  /** Minutes until the whole queue (active + waiting) is done. */
  queueClear: number | undefined;
}

/**
 * Wave model: the `idleCount` idle builders pick up the first waiting packages
 * immediately; every further wave of `buildersTotal` packages starts as the
 * builders free up, one wave duration after the previous. Builders are treated
 * as interchangeable (build classes are not matched).
 */
export function computeQueueEstimates(input: QueueEstimatesInput): QueueEstimates {
  const { active, waiting, idle, nowMs, avgOf } = input;

  const activeFinish = new Map<string, number>();
  const builders: Builder[] = [];
  for (const build of active) {
    const average = avgOf(build.pkgname);
    if (average === undefined) continue;
    const elapsedMinutes = Math.max(0, (nowMs - build.startedMs) / MS_PER_MINUTE);
    const remaining = Math.max(0, average - elapsedMinutes);
    activeFinish.set(build.pkgname, remaining);
    builders.push({ freeMinutes: remaining, buildClass: build.buildClass });
  }
  for (const node of idle) {
    builders.push({ freeMinutes: 0, buildClass: node.buildClass });
  }

  const empty = { activeFinish, waitingStart: new Map<string, number>(), queueClear: undefined };
  if (builders.length === 0 || waiting.length === 0) {
    return { ...empty, queueClear: maxOf(activeFinish.values()) };
  }
  // Without any historical data there is no basis for an estimate at all.
  if (activeFinish.size === 0 && !waiting.some((pkg) => avgOf(pkg.pkgname) !== undefined)) {
    return empty;
  }

  // Assign each waiting build to the earliest-free builder that can run its class.
  const waitingStart = new Map<string, number>();
  const waitingFinish = new Map<string, number>();
  for (const pkg of waiting) {
    const eligible = builders.filter((builder) => canPickUp(builder.buildClass, pkg.buildClass));
    if (eligible.length === 0) continue;
    const builder = earliestFree(eligible);
    const start = builder.freeMinutes;
    waitingStart.set(pkg.pkgname, start);
    const average = avgOf(pkg.pkgname);
    if (average !== undefined) {
      builder.freeMinutes = start + average;
      waitingFinish.set(pkg.pkgname, start + average);
    }
  }

  return {
    activeFinish,
    waitingStart,
    queueClear: maxOf([...activeFinish.values(), ...waitingFinish.values()]),
  };
}

function earliestFree(builders: Builder[]): Builder {
  let earliest = builders[0];
  for (const builder of builders) {
    if (builder.freeMinutes < earliest.freeMinutes) earliest = builder;
  }
  return earliest;
}

function maxOf(values: Iterable<number>): number | undefined {
  let max: number | undefined;
  for (const value of values) {
    max = max === undefined ? value : Math.max(max, value);
  }
  return max;
}

/** Compact label for an estimate in minutes: `~6m`, `~1h 20m`, `~<1m`. */
export function formatEta(minutes: number): string {
  if (minutes < 1) return '~<1m';
  return `~${formatDuration(Math.round(minutes) * SECONDS_PER_MINUTE)}`;
}
