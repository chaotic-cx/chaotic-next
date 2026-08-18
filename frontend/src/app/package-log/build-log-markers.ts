export const SCAN_BUFFER_LENGTH = 256;

const MS_PER_SECOND = 1000;

export type BuildEndReason = 'success' | 'failed' | 'timed_out' | 'canceled' | 'node_disconnected';

export interface BuildLogMarkers {
  builder?: string;
  buildStartMs?: number;
  buildEndMs?: number;
  /** Why the build ended. Success embeds a timestamp in the log; the other
   * reasons do not, so callers must fall back to the wall clock for those. */
  endReason?: BuildEndReason;
}

export function parseLogTimestamp(value: string): number {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const [, day, month, year, hour, minute, second] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

export function elapsedSecondsBetween(startMs: number, endMs: number): number {
  return Math.max(0, Math.floor((endMs - startMs) / MS_PER_SECOND));
}

/**
 * Maps the terminal "Job <id> <outcome>" lines the manager writes when a build
 * ends without having finished the package. Order matters: more specific
 * phrases must be checked before the generic `failed` (e.g. "execution failed").
 */
function findEndReason(buffer: string): BuildEndReason | undefined {
  if (/Job \S+ reached a timeout/.test(buffer)) return 'timed_out';
  if (/Job \S+ was canceled/.test(buffer)) return 'canceled';
  if (/Job \S+ execution failed/.test(buffer)) return 'node_disconnected';
  if (/Didn't finish building the package!/.test(buffer)) return 'failed';
  if (/Job \S+ failed/.test(buffer)) return 'failed';
  return undefined;
}

/**
 * Finds builder/start/end markers in a log buffer. Pass the previously found
 * markers as `prior` so already-resolved markers are never re-read; each marker
 * is matched only once even if its text appears in the buffer multiple times.
 * Markers are UTC; timestamps are parsed as such to stay timezone-safe.
 */
export function findBuildLogMarkers(buffer: string, prior: BuildLogMarkers): BuildLogMarkers {
  const markers: BuildLogMarkers = { ...prior };

  if (markers.builder === undefined) {
    const builder = buffer.match(/Executing build on host ([^\s.,]+)/);
    if (builder?.[1]) markers.builder = builder[1];
  }

  if (markers.buildStartMs === undefined) {
    const start = buffer.match(/Processing build job at (\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}) UTC/);
    if (start?.[1]) {
      const ms = parseLogTimestamp(start[1]);
      if (Number.isFinite(ms)) markers.buildStartMs = ms;
    }
  }

  if (markers.buildEndMs === undefined && markers.endReason === undefined) {
    const end = buffer.match(/Build job \S+ finished at (\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}) UTC/);
    if (end?.[1]) {
      const ms = parseLogTimestamp(end[1]);
      if (Number.isFinite(ms)) {
        markers.buildEndMs = ms;
        markers.endReason = 'success';
      }
    } else {
      markers.endReason = findEndReason(buffer);
    }
  }

  return markers;
}

export function elapsedSecondsFromMarkers(markers: BuildLogMarkers): number | undefined {
  if (markers.buildStartMs === undefined || markers.buildEndMs === undefined) return undefined;
  return elapsedSecondsBetween(markers.buildStartMs, markers.buildEndMs);
}
