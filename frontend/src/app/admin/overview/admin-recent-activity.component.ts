import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MrAction, Paginated, PipelineOperation, PipelineTriggerAction } from '@chaotic-next/shared-lib';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { resourceFailed, resourceValue } from '../../functions';
import { mergeRequestUrl } from '../../gitlab-links';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { OVERVIEW_SKELETON_ROWS } from './overview-constants';

const ACTIVITY_FETCH_SIZE = 6;
const ACTIVITY_VISIBLE_SIZE = 8;

const MR_ACTION_VERBS: Record<string, string> = {
  approve: 'approved',
  hold: 'put on hold',
  dangerous: 'flagged as dangerous',
};

const PIPELINE_OPERATION_VERBS: Record<PipelineOperation, string> = {
  [PipelineOperation.NONE]: 'started a pipeline on',
  [PipelineOperation.BUMP_PACKAGES]: 'bumped packages on',
  [PipelineOperation.SCHEDULE_PACKAGES]: 'scheduled packages on',
  [PipelineOperation.RUN_SCHEDULE]: 'ran a schedule on',
  [PipelineOperation.DROP_PACKAGES]: 'dropped packages on',
  [PipelineOperation.ADD_PACKAGES]: 'added packages on',
};

interface ActivityEntry {
  key: string;
  user: string;
  verb: string;
  target: string;
  href: string | null;
  at: string;
}

@Component({
  selector: 'chaotic-admin-recent-activity',
  imports: [LoadErrorComponent, RelativeTimePipe, RouterLink],
  template: `
    <section class="chaotic-card h-full" aria-labelledby="overview-activity-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="overview-activity-title">Recent activity</h2>
        <a class="chaotic-card__link" routerLink="../mr-actions">All MR actions</a>
      </header>
      @if (loading()) {
        <ul class="chaotic-mini-list" aria-hidden="true">
          @for (row of skeletonRows; track row) {
            <li><span class="chaotic-skeleton h-4 w-full"></span></li>
          }
        </ul>
      } @else if (failed()) {
        <chaotic-load-error (retry)="retry()" message="Could not load recent activity." />
      } @else if (entries().length === 0) {
        <p class="chaotic-card__empty">No maintainer actions recorded yet.</p>
      } @else {
        <ol class="chaotic-mini-list">
          @for (entry of entries(); track entry.key) {
            <li>
              <p class="activity-text">
                <span class="activity-user">{{ entry.user }}</span>
                {{ entry.verb }}
                @if (entry.href) {
                  <a class="activity-target" [href]="entry.href" target="_blank" rel="noopener noreferrer">{{
                    entry.target
                  }}</a>
                } @else {
                  <span class="activity-target">{{ entry.target }}</span>
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
      color: var(--ctp-mocha-subtext0);
    }

    .activity-user {
      font-weight: 500;
      color: var(--ctp-mocha-text);
    }

    .activity-target {
      font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
      font-size: 0.8125rem;
      color: var(--ctp-mocha-text);
    }

    a.activity-target:hover {
      color: var(--ctp-mocha-mauve);
    }
  `,
})
export class AdminRecentActivityComponent {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  protected readonly skeletonRows = OVERVIEW_SKELETON_ROWS;

  private readonly mrActionsResource = httpResource<Paginated<MrAction>>(() => ({
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
    verb: MR_ACTION_VERBS[action.action] ?? action.action,
    target: `!${action.mergeRequestIid}`,
    href: mergeRequestUrl(action.mergeRequestIid),
    at: action.createdAt,
  };
}

function toTriggerActivity(trigger: PipelineTriggerAction): ActivityEntry {
  const verb = PIPELINE_OPERATION_VERBS[trigger.operation as PipelineOperation] ?? `ran ${trigger.operation} on`;
  return {
    key: `trigger-${trigger.id}`,
    user: trigger.userName,
    verb,
    target: trigger.ref,
    href: trigger.webUrl ?? null,
    at: trigger.createdAt,
  };
}
