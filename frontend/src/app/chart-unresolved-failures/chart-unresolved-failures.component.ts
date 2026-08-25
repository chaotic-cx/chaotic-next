import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import type { UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { BUILD_RATE_LIMIT_FAILURE_STREAK, BUILD_RATE_LIMIT_RETRY_HOURS, BuildStatus } from '@chaotic-next/shared-lib';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AuthService } from 'ngx-better-auth';
import { AppService, ALL_TIME_DAYS } from '../app.service';
import { backendErrorMessage } from '../api-errors';
import { packageLogRouteFromUrl, resourceValue } from '../functions';
import { formatRelativeTime } from '../pipes/relative-time.pipe';
import { StatsService } from '../stats/stats.service';

const MAX_VISIBLE_ROWS = 30;

/**
 * Ranks failures worst-streak first and applies the silenced filter before the
 * row cap, so silenced rows stay visible among the top entries when shown
 * instead of being cut by the cap behind all active rows.
 */
export function visibleFailureRows(
  rows: UnresolvedFailedBuild[],
  showSilenced: boolean,
  max: number,
): UnresolvedFailedBuild[] {
  const ranked = rows.toSorted(
    (left, right) =>
      right.consecutiveFailures - left.consecutiveFailures || Date.parse(right.timestamp) - Date.parse(left.timestamp),
  );
  return (showSilenced ? ranked : ranked.filter((row) => !row.silenced)).slice(0, max);
}

const STATUS_COLORS: Partial<Record<BuildStatus, string>> = {
  [BuildStatus.FAILED]: flavors.mocha.colors.red.hex,
  [BuildStatus.TIMED_OUT]: flavors.mocha.colors.peach.hex,
  [BuildStatus.SOFTWARE_FAILURE]: flavors.mocha.colors.maroon.hex,
};

const RATE_LIMIT_RETRY_MS = BUILD_RATE_LIMIT_RETRY_HOURS * 60 * 60 * 1000;

/**
 * Mirrors the backend should-build rule: a package with a failure streak at
 * or beyond the limit, whose newest attempt is younger than the retry
 * cooldown, is currently skipped.
 */
export function isRateLimited(row: UnresolvedFailedBuild, nowMs: number = Date.now()): boolean {
  if (row.consecutiveFailures < BUILD_RATE_LIMIT_FAILURE_STREAK) return false;
  const ageMs = nowMs - Date.parse(row.timestamp);
  return !Number.isNaN(ageMs) && ageMs < RATE_LIMIT_RETRY_MS;
}

const HOUR_MS = 60 * 60 * 1000;

/** Compact streak age for the badge: `<1h`, `5h`, `9d`. Empty when unparseable. */
export function streakDurationLabel(startedIso: string, nowMs: number = Date.now()): string {
  const started = Date.parse(startedIso);
  if (Number.isNaN(started)) return '';
  const hours = Math.floor(Math.max(0, nowMs - started) / HOUR_MS);
  if (hours < 1) return '<1h';
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

@Component({
  selector: 'chaotic-chart-unresolved-failures',
  imports: [RouterLink, Tooltip],
  templateUrl: './chart-unresolved-failures.component.html',
  styleUrl: './chart-unresolved-failures.component.css',
})
export class ChartUnresolvedFailuresComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly authService = inject(AuthService);
  private readonly messageToastService = inject(MessageToastService);

  private readonly resource = httpResource<UnresolvedFailedBuild[]>(() =>
    this.appService.getUnresolvedFailedBuildsResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly showSilenced = signal(false);

  protected readonly formatRelativeTime = formatRelativeTime;
  protected readonly busyPkgname = signal<string | null>(null);

  private readonly failures = computed(() => resourceValue(this.resource) ?? []);

  readonly activeCount = computed(() => this.failures().filter((row) => !row.silenced).length);

  readonly silencedCount = computed(() => this.failures().filter((row) => row.silenced).length);

  readonly visibleRows = computed(() => visibleFailureRows(this.failures(), this.showSilenced(), MAX_VISIBLE_ROWS));

  statusColor(status: BuildStatus): string {
    return STATUS_COLORS[status] ?? flavors.mocha.colors.overlay1.hex;
  }

  protected readonly isRateLimited = isRateLimited;
  protected readonly packageLogRouteFromUrl = packageLogRouteFromUrl;
  protected readonly streakDurationLabel = streakDurationLabel;

  protected streakTooltip(row: UnresolvedFailedBuild): string {
    return `${row.consecutiveFailures} failed builds since ${formatRelativeTime(row.streakStartedAt)}`;
  }

  isBusy(row: UnresolvedFailedBuild): boolean {
    return this.busyPkgname() === row.pkgname;
  }

  async toggleSilence(row: UnresolvedFailedBuild): Promise<void> {
    this.busyPkgname.set(row.pkgname);
    const silencing = !row.silenced;
    this.resource.update((rows) =>
      rows?.map((candidate) => (candidate.pkgname === row.pkgname ? { ...candidate, silenced: silencing } : candidate)),
    );
    try {
      if (silencing) {
        await this.appService.silenceUnresolvedFailedBuild(row.pkgname);
        this.messageToastService.success('Failure silenced', `${row.pkgname} stays hidden until it fails again.`);
      } else {
        await this.appService.unsilenceUnresolvedFailedBuild(row.pkgname);
      }
    } catch (error) {
      this.messageToastService.error(
        'Operation failed',
        backendErrorMessage(error, `Could not update ${row.pkgname}.`),
      );
      this.resource.reload();
    } finally {
      this.busyPkgname.set(null);
    }
  }
}
