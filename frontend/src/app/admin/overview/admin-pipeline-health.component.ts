import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BuildStatusService, type PipelineView } from '../../build-status/build-status.service';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { OVERVIEW_SKELETON_ROWS } from './overview-constants';

const VISIBLE_PIPELINES = 6;
const ACTIVE_PIPELINE_STATUSES = new Set(['created', 'waiting_for_resource', 'preparing', 'pending', 'running']);

type PipelineTone = 'failed' | 'active' | 'ok' | 'idle';

const TONE_CLASSES: Record<PipelineTone, string> = {
  failed: 'bg-ctp-red',
  active: 'bg-ctp-blue',
  ok: 'bg-ctp-green',
  idle: 'bg-ctp-overlay0',
};

interface PipelineRow {
  id: number;
  url: string;
  createdAt: string;
  statusText: string;
  tone: PipelineTone;
}

@Component({
  selector: 'chaotic-admin-pipeline-health',
  imports: [LoadErrorComponent, RelativeTimePipe, RouterLink],
  template: `
    <section class="chaotic-card" aria-labelledby="overview-pipelines-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="overview-pipelines-title">Pipelines</h2>
        @if (failedCount() > 0) {
          <span class="pipeline-failed">{{ failedCount() }} with failed jobs</span>
        }
        <a class="chaotic-card__link" routerLink="/status">Build status</a>
      </header>
      @if (buildStatusService.loadingPipelines() && rows().length === 0) {
        <ul class="chaotic-mini-list" aria-hidden="true">
          @for (row of skeletonRows; track row) {
            <li><span class="chaotic-skeleton h-4 w-full"></span></li>
          }
        </ul>
      } @else if (buildStatusService.pipelinesFailed() && rows().length === 0) {
        <chaotic-load-error (retry)="buildStatusService.getPipelines()" message="Could not load pipelines." />
      } @else if (rows().length === 0) {
        <p class="chaotic-card__empty">No pipelines ran recently.</p>
      } @else {
        <ul class="chaotic-mini-list">
          @for (row of rows(); track row.id) {
            <li class="pipeline-row">
              <span class="pipeline-dot" [class]="toneClasses[row.tone]" aria-hidden="true"></span>
              <a class="chaotic-mini-list__name pipeline-link" [href]="row.url" target="_blank" rel="noopener"
                >#{{ row.id }}</a
              >
              <span class="pipeline-status">{{ row.statusText }}</span>
              <span class="chaotic-mini-list__meta">{{ row.createdAt | relativeTime }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .pipeline-row {
      align-items: center;
    }

    .pipeline-dot {
      flex: none;
      width: 6px;
      height: 6px;
      border-radius: 9999px;
    }

    .pipeline-link:hover {
      color: var(--ctp-mocha-mauve);
    }

    .pipeline-status {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.8125rem;
      color: var(--ctp-mocha-subtext0);
    }

    .pipeline-failed {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--ctp-mocha-red);
    }
  `,
})
export class AdminPipelineHealthComponent {
  protected readonly buildStatusService = inject(BuildStatusService);

  protected readonly skeletonRows = OVERVIEW_SKELETON_ROWS;
  protected readonly toneClasses = TONE_CLASSES;

  protected readonly rows = computed<PipelineRow[]>(() =>
    this.buildStatusService.pipelineWithStatus().slice(0, VISIBLE_PIPELINES).map(toPipelineRow),
  );

  protected readonly failedCount = computed(() => this.rows().filter((row) => row.tone === 'failed').length);
}

function toPipelineRow(view: PipelineView): PipelineRow {
  return {
    id: view.pipeline.id,
    url: view.pipeline.web_url,
    createdAt: view.pipeline.created_at,
    statusText: view.statusText,
    tone: pipelineTone(view),
  };
}

function pipelineTone(view: PipelineView): PipelineTone {
  if (view.pipeline.status === 'failed' || view.commit.some((job) => job.status === 'failed')) return 'failed';
  if (ACTIVE_PIPELINE_STATUSES.has(view.pipeline.status)) return 'active';
  if (view.pipeline.status === 'success') return 'ok';
  return 'idle';
}
