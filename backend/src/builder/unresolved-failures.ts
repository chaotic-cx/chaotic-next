import {
  BUILD_FAILURE_STATUSES,
  BUILD_RATE_LIMIT_FAILURE_STREAK,
  BUILD_RATE_LIMIT_RETRY_HOURS,
  BUILD_SUCCESS_STATUSES,
  BUILD_VERDICT_STATUSES,
  STATUS_LABELS,
  BuildStatus,
  isBuildStatus,
  type UnresolvedFailedBuild,
} from '@chaotic-next/shared-lib';

export const FAILURE_SQL_STATUSES = BUILD_FAILURE_STATUSES.map(String);
export const SUCCESS_SQL_STATUSES = BUILD_SUCCESS_STATUSES.map(String);
export const VERDICT_SQL_STATUSES = BUILD_VERDICT_STATUSES.map(String);

export const FLAKY_ATTEMPT_SQL_STATUSES = [String(BuildStatus.SUCCESS), ...FAILURE_SQL_STATUSES];

export const UNRESOLVED_FAILURE_LOOKBACK_DAYS = 90;
export const UNRESOLVED_FAILURE_LIMIT = 500;

export const SHOULD_BUILD_TRAILING_DAYS = 30;
export const SHOULD_BUILD_MAX_RECENT_BUILDS = 20;
const SHOULD_BUILD_RETRY_MS = BUILD_RATE_LIMIT_RETRY_HOURS * 60 * 60 * 1000;

export interface UnresolvedFailureRow {
  pkgname: string;
  status: string;
  timestamp: Date | string;
  logUrl: string | null;
  consecutiveFailures: number;
  streakStartedAt: Date | string | null;
  silenced: boolean;
}

export function unresolvedFailedBuildFromRow(row: UnresolvedFailureRow): UnresolvedFailedBuild | null {
  const status = Number(row.status);
  if (!isBuildStatus(status)) return null;
  const timestamp = new Date(row.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  // A listed row always has at least one failing build, so the streak start
  // falls back to the latest failure when the aggregate came back empty.
  const streakStartMs = row.streakStartedAt === null ? null : new Date(row.streakStartedAt).getTime();
  return {
    pkgname: row.pkgname,
    status,
    statusText: STATUS_LABELS[status],
    timestamp: timestamp.toISOString(),
    streakStartedAt: new Date(streakStartMs ?? timestamp.getTime()).toISOString(),
    logUrl: row.logUrl,
    consecutiveFailures: Number(row.consecutiveFailures),
    silenced: row.silenced === true,
  };
}

export function isFailingStatus(status: BuildStatus): boolean {
  return BUILD_FAILURE_STATUSES.includes(status);
}

/**
 * Decides whether dispatching a build for a pkgbase is likely to succeed,
 * from its most recent verdict builds (newest first, verdict statuses only).
 * Packages stuck in a failure loop stay rate-limited until a build resolves
 * the streak; packages without recent builds are always worth building. A
 * blocked package becomes eligible again once its newest attempt is older
 * than the retry cooldown, so failing packages still get retried regularly.
 */
export function shouldBuildDecision(
  statuses: string[],
  newestBuildAgeMs: number | null,
): { shouldBuild: boolean; consecutiveFailures: number } {
  let consecutiveFailures = 0;
  for (const status of statuses) {
    if (!FAILURE_SQL_STATUSES.includes(status)) break;
    consecutiveFailures++;
  }
  if (consecutiveFailures < BUILD_RATE_LIMIT_FAILURE_STREAK) {
    return { shouldBuild: true, consecutiveFailures };
  }
  const cooldownOver = newestBuildAgeMs !== null && newestBuildAgeMs >= SHOULD_BUILD_RETRY_MS;
  return { shouldBuild: cooldownOver, consecutiveFailures };
}
