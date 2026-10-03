import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { isLogPurged, packageLogRouteFromUrl } from '../../functions';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import {
  failureStatusColor,
  isRateLimited,
  streakDurationLabel,
} from '../../stats/charts/builds/chart-unresolved-failures/chart-unresolved-failures.component';

@Component({
  selector: 'chaotic-admin-failure-table',
  imports: [RelativeTimePipe, RouterLink, Tooltip],
  templateUrl: './admin-failure-table.component.html',
  styleUrl: './admin-failure-table.component.css',
})
export class AdminFailureTableComponent {
  readonly rows = input.required<UnresolvedFailedBuild[]>();
  readonly canSilence = input(false);
  readonly busy = input(false);
  readonly toggleSilence = output<UnresolvedFailedBuild>();

  protected readonly statusColor = failureStatusColor;
  protected readonly isRateLimited = isRateLimited;
  protected readonly isLogPurged = isLogPurged;
  protected readonly packageLogRouteFromUrl = packageLogRouteFromUrl;
  protected readonly streakDurationLabel = streakDurationLabel;
}
