import { formatDuration } from '../functions';

const MS_PER_MINUTE = 60_000;
const SECONDS_PER_MINUTE = 60;
export const OVERTIME_THRESHOLD_MINUTES = 2;

/** Average build duration of a package in minutes, optionally per builder node, undefined when unknown. */
export type AverageLookup = (pkgname: string, builderName?: string) => number | undefined;

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

/** Sorts queue entries keyed by `rawName` by their start time, earliest first.
 * Entries without a recorded start time sort last, preserving relative order. */
export function sortByStartTime<T extends { rawName: string }>(
  entries: readonly T[],
  startTime: ReadonlyMap<string, number>,
): T[] {
  return [...entries].sort((a, b) => {
    const aStart = startTime.get(a.rawName);
    const bStart = startTime.get(b.rawName);
    if (aStart === undefined && bStart === undefined) return 0;
    if (aStart === undefined) return 1;
    if (bStart === undefined) return -1;
    return aStart - bStart;
  });
}

/** Sorts entries by start time then returns the `size`-sized page at `page`
 * (1-based). Entries without a start time land last. */
export function paginateByStartTime<T extends { rawName: string }>(
  entries: readonly T[],
  startTime: ReadonlyMap<string, number>,
  page: number,
  size: number,
): T[] {
  const sorted = sortByStartTime(entries, startTime);
  const start = (page - 1) * size;
  return sorted.slice(start, start + size);
}

export interface ActiveBuildInput {
  rawName: string;
  /** When the build was first seen running; wall-clock ms. */
  startedMs: number;
  buildClass: number | string | null;
  builderName?: string;
}

export interface WaitingBuildInput {
  rawName: string;
  buildClass: number | string | null;
}

export interface IdleBuilderInput {
  buildClass: number | string | null;
  builderName?: string;
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
  builderName?: string;
}

export interface QueueEstimates {
  /** Remaining minutes per active package (avg - elapsed, clamped). */
  activeFinish: Map<string, number>;
  /** Overtime minutes per active package (elapsed - average) when >= threshold. */
  activeOvertime: Map<string, number>;
  /** Absolute start ms per active package (wall-clock). */
  activeStartedAt: Map<string, number>;
  /** Minutes until each waiting package starts building. */
  waitingStart: Map<string, number>;
  /** Minutes until the whole queue (active + waiting) is done. */
  queueClear: number | undefined;
}

/**
 * Wave model: idle builders pick up the first waiting packages immediately;
 * every further wave starts as builders free up. Builders match by class:
 * numeric `build <= builder`, string `===` (intentional — string builders
 * never run numeric classes).
 */
export function computeQueueEstimates(input: QueueEstimatesInput): QueueEstimates {
  const { active, waiting, idle, nowMs, avgOf } = input;

  const activeFinish = new Map<string, number>();
  const activeOvertime = new Map<string, number>();
  const activeStartedAt = new Map<string, number>();
  const builders: Builder[] = [];
  for (const build of active) {
    activeStartedAt.set(build.rawName, build.startedMs);
    const average = avgOf(build.rawName, build.builderName) ?? avgOf(build.rawName);
    if (average === undefined) continue;
    const elapsedMinutes = Math.max(0, (nowMs - build.startedMs) / MS_PER_MINUTE);
    const remaining = Math.max(0, average - elapsedMinutes);
    const overtime = elapsedMinutes - average;
    if (overtime >= OVERTIME_THRESHOLD_MINUTES) activeOvertime.set(build.rawName, overtime);
    activeFinish.set(build.rawName, remaining);
    builders.push({ freeMinutes: remaining, buildClass: build.buildClass, builderName: build.builderName });
  }
  // Builds without known average still occupy a builder (prevents false idle for 9-only queues)
  for (const build of active) {
    if (!activeFinish.has(build.rawName)) {
      builders.push({ freeMinutes: 0, buildClass: build.buildClass, builderName: build.builderName });
    }
  }
  for (const node of idle) {
    builders.push({ freeMinutes: 0, buildClass: node.buildClass, builderName: node.builderName });
  }

  const empty: QueueEstimates = {
    activeFinish,
    activeOvertime,
    activeStartedAt,
    waitingStart: new Map<string, number>(),
    queueClear: undefined,
  };
  if (builders.length === 0 || waiting.length === 0) {
    return { ...empty, queueClear: maxOf(activeFinish.values()) };
  }
  // Without any historical data there is no basis for an estimate at all.
  if (activeFinish.size === 0 && !waiting.some((pkg) => avgOf(pkg.rawName) !== undefined)) {
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
    waitingStart.set(pkg.rawName, start);
    const average = avgOf(pkg.rawName, builder.builderName) ?? avgOf(pkg.rawName);
    if (average !== undefined) {
      builder.freeMinutes = start + average;
      waitingFinish.set(pkg.rawName, start + average);
    }
  }

  return {
    activeFinish,
    activeOvertime,
    activeStartedAt,
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
