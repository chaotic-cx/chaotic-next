import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MrAction, Paginated, PipelineOperation, PipelineTriggerAction } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { resourceFailed, resourceValue } from '../../functions';
import { mergeRequestUrl } from '../../gitlab-links';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { SkeletonListComponent } from '../../table-skeleton/skeleton-list.component';
import { OVERVIEW_SKELETON_ROWS } from './overview-constants';

const ACTIVITY_FETCH_SIZE = 6;
const ACTIVITY_VISIBLE_SIZE = 8;

const MR_ACTION_VERB_KEYS: Record<string, string> = {
  approve: marker('admin.overview.recentActivity.mrVerbs.approve'),
  hold: marker('admin.overview.recentActivity.mrVerbs.hold'),
  dangerous: marker('admin.overview.recentActivity.mrVerbs.dangerous'),
};

const UNKNOWN_MR_ACTION_VERB_KEY = marker('admin.overview.recentActivity.mrVerbs.unknown');

const PIPELINE_OPERATION_VERB_KEYS: Record<PipelineOperation, string> = {
  [PipelineOperation.NONE]: marker('admin.overview.recentActivity.pipelineVerbs.none'),
  [PipelineOperation.BUMP_PACKAGES]: marker('admin.overview.recentActivity.pipelineVerbs.bumpPackages'),
  [PipelineOperation.SCHEDULE_PACKAGES]: marker('admin.overview.recentActivity.pipelineVerbs.schedulePackages'),
  [PipelineOperation.RUN_SCHEDULE]: marker('admin.overview.recentActivity.pipelineVerbs.runSchedule'),
  [PipelineOperation.DROP_PACKAGES]: marker('admin.overview.recentActivity.pipelineVerbs.dropPackages'),
  [PipelineOperation.ADD_PACKAGES]: marker('admin.overview.recentActivity.pipelineVerbs.addPackages'),
};

const UNKNOWN_PIPELINE_OPERATION_VERB_KEY = marker('admin.overview.recentActivity.pipelineVerbs.unknown');

interface ActivityEntry {
  key: string;
  user: string;
  verbKey: string;
  verbParams: Record<string, string>;
  // Merge requests show their !iid; pipeline triggers show no target.
  target: string | null;
  href: string | null;
  at: string;
}

@Component({
  selector: 'chaotic-admin-recent-activity',
  imports: [LoadErrorComponent, RelativeTimePipe, RouterLink, SkeletonListComponent, TranslocoDirective],
  template: `
    <section class="chaotic-card h-full" *transloco="let t" aria-labelledby="overview-activity-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="overview-activity-title">
          {{ t('admin.overview.recentActivity.title') }}
        </h2>
        <a class="chaotic-card__link" routerLink="../mr-actions">{{
          t('admin.overview.recentActivity.allMrActions')
        }}</a>
      </header>
      @if (loading()) {
        <chaotic-skeleton-list [rows]="skeletonRows" />
      } @else if (failed()) {
        <chaotic-load-error
          [message]="t('admin.overview.recentActivity.loadError')"
          [error]="mrActionsResource.error()"
          (retry)="retry()"
        />
      } @else if (entries().length === 0) {
        <p class="chaotic-card__empty">{{ t('admin.overview.recentActivity.empty') }}</p>
      } @else {
        <ol class="chaotic-mini-list">
          @for (entry of entries(); track entry.key) {
            <li>
              <p class="activity-text">
                <span class="activity-user">{{ entry.user }}</span>
                {{ t(entry.verbKey, entry.verbParams) }}
                @if (entry.target !== null) {
                  @if (entry.href) {
                    <a class="activity-target" [href]="entry.href" target="_blank" rel="noopener noreferrer">{{
                      entry.target
                    }}</a>
                  } @else {
                    <span class="activity-target">{{ entry.target }}</span>
                  }
                }
              </p>
              <span class="chaotic-mini-list__meta">{{ entry.at | relativeTime }}</span>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: `
    .activity-text {
      flex: 1;
      min-width: 0;
      line-height: 1.45;
      color: var(--chaotic-fg-muted);
    }

    .activity-user {
      font-weight: var(--chaotic-weight-medium);
      color: var(--catppuccin-color-text);
    }

    .activity-target {
      font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
      font-size: 0.8125rem;
      color: var(--catppuccin-color-text);
    }

    a.activity-target:hover,
    a.activity-target:focus-visible {
      color: var(--catppuccin-color-mauve);
    }
  `,
})
export class AdminRecentActivityComponent {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  protected readonly skeletonRows = OVERVIEW_SKELETON_ROWS;

  protected readonly mrActionsResource = httpResource<Paginated<MrAction>>(() => ({
    url: `${this.backendUrl}/admin/mr-actions`,
    params: { page: 1, perPage: ACTIVITY_FETCH_SIZE },
  }));
  private readonly pipelineTriggersResource = httpResource<Paginated<PipelineTriggerAction>>(() => ({
    url: `${this.backendUrl}/admin/pipeline-triggers`,
    params: { page: 1, perPage: ACTIVITY_FETCH_SIZE },
  }));

  private readonly mrActionsFailed = resourceFailed(this.mrActionsResource);
  private readonly pipelineTriggersFailed = resourceFailed(this.pipelineTriggersResource);

  protected readonly failed = computed(() => this.mrActionsFailed() && this.pipelineTriggersFailed());
  protected readonly loading = computed(
    () => !this.mrActionsResource.hasValue() && !this.pipelineTriggersResource.hasValue() && !this.failed(),
  );
  protected readonly entries = computed<ActivityEntry[]>(() => {
    const mrEntries = (resourceValue(this.mrActionsResource)?.items ?? []).map(toMrActivity);
    const triggerEntries = (resourceValue(this.pipelineTriggersResource)?.items ?? []).map(toTriggerActivity);
    return [...mrEntries, ...triggerEntries]
      .toSorted((left, right) => Date.parse(right.at) - Date.parse(left.at))
      .slice(0, ACTIVITY_VISIBLE_SIZE);
  });

  protected retry(): void {
    this.mrActionsResource.reload();
    this.pipelineTriggersResource.reload();
  }
}

function toMrActivity(action: MrAction): ActivityEntry {
  return {
    key: `mr-${action.id}`,
    user: action.userName,
    verbKey: MR_ACTION_VERB_KEYS[action.action] ?? UNKNOWN_MR_ACTION_VERB_KEY,
    verbParams: { action: action.action },
    target: `!${action.mergeRequestIid}`,
    href: mergeRequestUrl(action.mergeRequestIid),
    at: action.createdAt,
  };
}

function toTriggerActivity(trigger: PipelineTriggerAction): ActivityEntry {
  const verbKey =
    PIPELINE_OPERATION_VERB_KEYS[trigger.operation as PipelineOperation] ?? UNKNOWN_PIPELINE_OPERATION_VERB_KEY;

  return {
    key: `trigger-${trigger.id}`,
    user: trigger.userName,
    verbKey,
    verbParams: { operation: trigger.operation },
    target: null,
    href: null,
    at: trigger.createdAt,
  };
}
