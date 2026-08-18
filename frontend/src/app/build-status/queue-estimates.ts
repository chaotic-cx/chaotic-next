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
}

export interface QueueEstimatesInput {
  active: ActiveBuildInput[];
  /** Waiting package names in queue order. */
  waiting: string[];
  idleCount: number;
  nowMs: number;
  avgOf: AverageLookup;
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
  const { active, waiting, idleCount, nowMs, avgOf } = input;
  const buildersTotal = active.length + idleCount;

  const activeFinish = new Map<string, number>();
  for (const build of active) {
    const average = avgOf(build.pkgname);
    if (average === undefined) continue;
    const elapsedMinutes = Math.max(0, (nowMs - build.startedMs) / MS_PER_MINUTE);
    activeFinish.set(build.pkgname, Math.max(0, average - elapsedMinutes));
  }

  const empty = { activeFinish, waitingStart: new Map<string, number>(), queueClear: undefined };
  if (buildersTotal === 0 || waiting.length === 0) {
    return { ...empty, queueClear: maxOf(activeFinish.values()) };
  }
  // Without any historical data there is no basis for an estimate at all.
  if (activeFinish.size === 0 && !waiting.some((pkgname) => avgOf(pkgname) !== undefined)) {
    return empty;
  }

  // Work currently occupying the builders: the running builds' remaining time
  // plus the packages the idle builders pick up immediately. The next wave
  // cannot start before those are done.
  const occupying: number[] = [...activeFinish.values()];
  for (let index = 0; index < Math.min(idleCount, waiting.length); index++) {
    const average = avgOf(waiting[index]);
    if (average !== undefined) occupying.push(average);
  }
  const firstFreeMinutes = averageOfValues(occupying) ?? 0;

  const waitingStart = new Map<string, number>();
  const waitingFinish = new Map<string, number>();
  waiting.forEach((pkgname, index) => {
    const startsNow = index < idleCount;
    const wave = startsNow ? 0 : Math.floor((index - idleCount) / buildersTotal);

    let startMinutes = firstFreeMinutes * (startsNow ? 0 : 1);
    for (let waveIndex = 0; waveIndex < wave; waveIndex++) {
      startMinutes += waveAverageMinutes(waiting, idleCount, buildersTotal, waveIndex, avgOf);
    }

    const average = avgOf(pkgname);
    waitingStart.set(pkgname, startMinutes);
    if (average !== undefined) {
      waitingFinish.set(pkgname, startMinutes + average);
    }
  });

  return {
    activeFinish,
    waitingStart,
    queueClear: maxOf([...activeFinish.values(), ...waitingFinish.values()]),
  };
}

function waveAverageMinutes(
  waiting: string[],
  idleCount: number,
  buildersTotal: number,
  waveIndex: number,
  avgOf: AverageLookup,
): number {
  const from = idleCount + waveIndex * buildersTotal;
  const to = Math.min(waiting.length, from + buildersTotal);
  let sum = 0;
  let samples = 0;
  for (let index = from; index < to; index++) {
    const average = avgOf(waiting[index]);
    if (average !== undefined) {
      sum += average;
      samples++;
    }
  }
  return samples > 0 ? sum / samples : 0;
}

function averageOfValues(values: Iterable<number>): number | undefined {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    sum += value;
    count++;
  }
  return count > 0 ? sum / count : undefined;
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
