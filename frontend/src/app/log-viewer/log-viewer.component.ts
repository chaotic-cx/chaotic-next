import { CommonModule } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { GitlabJob } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Select } from '@openng/optimus-ui/select';
import { RequestFailure, requestFailure } from '../api-errors';
import { BackLinkComponent } from '../back-link/back-link.component';
import { preferredScrollBehavior, updateSeoTags } from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { bindRecordTitle } from '../i18n/record-title';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { LogLineLink } from '../log-stream/log-line-link';
import { createLogStream } from '../log-stream/log-stream';
import { TitleComponent } from '../title/title.component';
import { LogStreamStatusComponent } from '../xterm-log/log-stream-status.component';
import { XtermLogComponent } from '../xterm-log/xterm-log.component';
import { LogViewerService } from './log-viewer.service';

const RUNNING_STATUSES = new Set(['created', 'waiting_for_resource', 'preparing', 'pending', 'running']);
const RELEVANT_LOG_JOB_PATTERN = /commit|schedule/;
const JOB_SKELETON_CHIPS = [0, 1, 2, 3];

type JobsState = 'loading' | 'ready' | 'failed';

// GitLab job statuses with a translated label. Other statuses show as GitLab sends them.
const JOB_STATUS_KEYS: ReadonlyMap<string, string> = new Map([
  ['created', marker('gitlabStatus.created')],
  ['waiting_for_resource', marker('gitlabStatus.waitingForResource')],
  ['preparing', marker('gitlabStatus.preparing')],
  ['pending', marker('gitlabStatus.pending')],
  ['running', marker('gitlabStatus.running')],
  ['success', marker('gitlabStatus.success')],
  ['failed', marker('gitlabStatus.failed')],
  ['canceled', marker('gitlabStatus.canceled')],
  ['skipped', marker('gitlabStatus.skipped')],
  ['manual', marker('gitlabStatus.manual')],
  ['scheduled', marker('gitlabStatus.scheduled')],
]);

// Connection, permission and server failures share one message. The load error adds a hint for them.
const JOBS_FAILURE_KEYS: Record<RequestFailure, string> = {
  notFound: marker('logViewer.jobsError.notFound'),
  offline: marker('logViewer.jobsError.generic'),
  unreachable: marker('logViewer.jobsError.generic'),
  rateLimited: marker('logViewer.jobsError.rateLimited'),
  permission: marker('logViewer.jobsError.generic'),
  server: marker('logViewer.jobsError.generic'),
};

@Component({
  selector: 'chaotic-log-viewer',
  imports: [
    BackLinkComponent,
    CommonModule,
    FormsModule,
    LoadErrorComponent,
    LogStreamStatusComponent,
    Select,
    TitleComponent,
    TranslocoDirective,
    XtermLogComponent,
  ],
  templateUrl: './log-viewer.component.html',
  styleUrls: ['./log-viewer.component.css'],
})
export class LogViewerComponent {
  private readonly logService = inject(LogViewerService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  readonly pipelineId = input<string>();

  private readonly jobListEl = viewChild<ElementRef<HTMLDivElement>>('jobList');

  protected readonly jobs = signal<GitlabJob[]>([]);
  protected readonly jobsState = signal<JobsState>('loading');
  protected readonly jobsFailure = signal<RequestFailure>('server');
  protected readonly jobsError = signal<unknown>(undefined);
  protected readonly selectedJobId = signal<number | undefined>(undefined);
  protected readonly scrollToLine = signal<number | undefined>(undefined);
  protected readonly runningStatuses = RUNNING_STATUSES;
  protected readonly jobSkeletonChips = JOB_SKELETON_CHIPS;
  protected readonly jobsFailureKeys = JOBS_FAILURE_KEYS;

  protected readonly logStream = createLogStream();
  private readonly lineLink = new LogLineLink();

  protected readonly selectedJob = computed(() => this.jobs().find((job) => job.id === this.selectedJobId()));

  protected readonly jobOptions = computed(() => {
    this.activeTranslation();

    return this.jobs().map((job) => ({ label: `${job.name} (${this.jobStatusLabel(job.status)})`, value: job.id }));
  });

  constructor() {
    bindRecordTitle(
      computed(() => {
        this.activeTranslation();

        const pipelineId = this.pipelineId();
        if (!pipelineId) {
          return undefined;
        }

        return this.transloco.translate('logViewer.heading', { pipelineId });
      }),
    );

    effect(() => {
      const raw = this.pipelineId();
      if (raw) void this.loadPipeline(Number(raw));
    });

    // When a job is (auto-)selected, bring its chip into view in the stage bar.
    effect(() => {
      this.selectedJobId();
      this.jobs();
      const el = this.jobListEl()?.nativeElement.querySelector('.job-chip-selected');
      if (el) el.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest', inline: 'center' });
    });
  }

  protected jobStatusLabel(status: string): string {
    const key = JOB_STATUS_KEYS.get(status);
    if (key === undefined) {
      return status;
    }

    return this.transloco.translate(key);
  }

  protected selectJob(job: GitlabJob): void {
    this.selectedJobId.set(job.id);
    this.scrollToLine.set(job.id === this.requestedJobId() ? this.requestedLine() : undefined);

    // Replace the history entry: a job switch is not a new page, and Back must leave the viewer.
    const keepsLine = this.scrollToLine() !== undefined;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: keepsLine ? { job: job.id } : { job: job.id, line: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.openStream(job.id);
  }

  protected onJobSelect(id: number): void {
    const job = this.jobs().find((candidate) => candidate.id === id);
    if (job) this.selectJob(job);
  }

  protected retryPipeline(): void {
    const raw = this.pipelineId();
    if (raw) void this.loadPipeline(Number(raw));
  }

  protected retryStream(): void {
    const job = this.selectedJob();
    if (job) this.selectJob(job);
  }

  private async loadPipeline(pipelineId: number): Promise<void> {
    this.logStream.reset();
    this.jobs.set([]);
    this.jobsState.set('loading');
    this.selectedJobId.set(undefined);
    this.scrollToLine.set(undefined);

    updateSeoTags(this.meta, {
      title: this.transloco.translate('logViewer.seo.title', { pipelineId }),
      description: this.transloco.translate('logViewer.seo.description'),
      keywords: this.transloco.translate('logViewer.seo.keywords'),
      url: this.router.url,
    });

    let jobs: GitlabJob[];
    try {
      jobs = await this.logService.getJobs(pipelineId);
    } catch (error) {
      this.jobsError.set(error);
      this.jobsFailure.set(requestFailure(error));
      this.jobsState.set('failed');
      return;
    }

    this.jobs.set(jobs);
    this.jobsState.set('ready');

    const requestedJob = this.requestedJobId();
    const initial =
      jobs.find((job) => job.id === requestedJob) ?? (requestedJob === undefined ? pickInitialJob(jobs) : undefined);
    if (initial) this.selectJob(initial);
  }

  private requestedJobId(): number | undefined {
    const raw = this.route.snapshot.queryParamMap.get('job');
    if (raw === null) return undefined;
    const id = Number(raw);
    return Number.isInteger(id) ? id : undefined;
  }

  private requestedLine(): number | undefined {
    const raw = this.route.snapshot.queryParamMap.get('line');
    if (raw === null) return undefined;
    const line = Number(raw);
    return Number.isInteger(line) && line > 0 ? line : undefined;
  }

  private openStream(jobId: number): void {
    const raw = this.pipelineId();
    if (!raw) {
      return;
    }

    const pipelineId = Number(raw);
    this.logStream.start((offset) => this.logService.traceStreamUrl(pipelineId, jobId, offset));
  }

  protected onLineClick(line: number): void {
    this.lineLink.select(line);
  }
}

/**
 * Best job to open first: a running job. Once the pipeline finished, the on-commit
 * job, else any job whose name or stage mentions commit or schedule. Status does not
 * matter. Canceled jobs still carry their partial logs.
 */
export function pickInitialJob(jobs: GitlabJob[]): GitlabJob | undefined {
  const running = jobs.find((job) => job.status === 'running');
  if (running) return running;
  const relevant = jobs.filter((job) => RELEVANT_LOG_JOB_PATTERN.test(`${job.name} ${job.stage}`));
  return (
    relevant.find((job) => /commit/.test(`${job.name} ${job.stage}`)) ??
    relevant[0] ??
    jobs.find((job) => job.status === 'failed') ??
    jobs[0]
  );
}
