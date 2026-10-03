import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Builder, MAX_PER_PAGE, MergeRequestCounts, Paginated, UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from 'ngx-better-auth';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { AppService } from '../../app.service';
import { BuildStatusService } from '../../build-status/build-status.service';
import { resourceFailed, resourceValue } from '../../functions';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import {
  isRateLimited,
  visibleFailureRows,
} from '../../stats/charts/builds/chart-unresolved-failures/chart-unresolved-failures.component';
import { FailureSilenceService } from '../../stats/charts/builds/chart-unresolved-failures/failure-silence.service';
import { AdminBuildTrendsComponent } from './admin-build-trends.component';
import { AdminFailureTableComponent } from './admin-failure-table.component';
import { AdminPipelineHealthComponent } from './admin-pipeline-health.component';
import { AdminRecentActivityComponent } from './admin-recent-activity.component';
import { AdminRepoProblemsComponent } from './admin-repo-problems.component';
import { OVERVIEW_SKELETON_ROWS } from './overview-constants';

@Component({
  selector: 'chaotic-admin-overview-page',
  imports: [
    AdminBuildTrendsComponent,
    AdminFailureTableComponent,
    AdminPipelineHealthComponent,
    AdminRecentActivityComponent,
    AdminRepoProblemsComponent,
    LoadErrorComponent,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './admin-overview-page.component.html',
  styleUrl: './admin-overview-page.component.css',
})
export class AdminOverviewPageComponent {
  private readonly appService = inject(AppService);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly failureSilence = inject(FailureSilenceService);
  protected readonly buildStatusService = inject(BuildStatusService);
  protected readonly isLoggedIn = inject(AuthService).isLoggedIn;

  protected readonly skeletonRows = OVERVIEW_SKELETON_ROWS;
  protected readonly showSilenced = signal(false);
  protected readonly busyPkgname = this.failureSilence.busyPkgname;

  protected readonly failuresResource = httpResource<UnresolvedFailedBuild[]>(() =>
    this.appService.getUnresolvedFailedBuildsResourceRequest(),
  );
  private readonly buildersResource = httpResource<Paginated<Builder>>(() => ({
    url: `${this.backendUrl}/admin/builders`,
    params: { page: 1, perPage: MAX_PER_PAGE, active: 'true' },
  }));

  protected readonly failuresFailed = resourceFailed(this.failuresResource);
  protected readonly failuresLoading = computed(
    () => this.failuresResource.isLoading() && !this.failuresResource.hasValue(),
  );
  private readonly failures = computed(() => resourceValue(this.failuresResource) ?? []);
  private readonly activeFailures = computed(() => this.failures().filter((row) => !row.silenced));
  protected readonly failingCount = computed(() => this.activeFailures().length);
  protected readonly silencedCount = computed(() => this.failures().length - this.failingCount());
  protected readonly failureRows = computed(() => visibleFailureRows(this.failures(), this.showSilenced()));
  protected readonly rateLimitedCount = computed(
    () => this.activeFailures().filter((row) => isRateLimited(row)).length,
  );
  protected readonly longestStreak = computed(() =>
    this.activeFailures().reduce((longest, row) => Math.max(longest, row.consecutiveFailures), 0),
  );

  private readonly mrCountsResource = httpResource<MergeRequestCounts>(
    () => `${this.backendUrl}/gitlab/merge-requests/counts`,
  );
  protected readonly mrCounts = computed(() => resourceValue(this.mrCountsResource));
  protected readonly mrCountsFailed = resourceFailed(this.mrCountsResource);

  protected readonly enabledBuilders = computed(() => resourceValue(this.buildersResource)?.total ?? null);
  protected readonly busyBuilders = computed(
    () => new Set(this.buildStatusService.activeQueue().map((entry) => entry.node)).size,
  );
  protected readonly onlineBuilders = computed(() => this.busyBuilders() + this.buildStatusService.idleQueue().length);

  protected toggleSilence(row: UnresolvedFailedBuild): Promise<void> {
    return this.failureSilence.toggle(row, this.failuresResource);
  }

  protected retryFailures(): void {
    this.failuresResource.reload();
  }
}
