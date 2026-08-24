import { CommonModule } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { GitlabJob } from '@chaotic-next/shared-lib';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { Select } from '@openng/optimus-ui/select';
import { AppService } from '../app.service';
import { copyLineLink, errorMessage, parseLogChunk } from '../functions';
import { ResilientSseStream } from '../sse-stream';
import { TitleComponent } from '../title/title.component';
import { XtermLogComponent } from '../xterm-log/xterm-log.component';
import { LogViewerService } from './log-viewer.service';

const RUNNING_STATUSES = new Set(['created', 'waiting_for_resource', 'preparing', 'pending', 'running']);
const RELEVANT_LOG_JOB_PATTERN = /commit|schedule/;

@Component({
  selector: 'chaotic-log-viewer',
  imports: [XtermLogComponent, CommonModule, FormsModule, ProgressSpinner, Select, TitleComponent],
  templateUrl: './log-viewer.component.html',
  styleUrl: './log-viewer.component.css',
})
export class LogViewerComponent implements OnDestroy {
  private readonly appService = inject(AppService);
  private readonly logService = inject(LogViewerService);
  private readonly meta = inject(Meta);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pipelineId = input<string>();

  private readonly jobListEl = viewChild<ElementRef<HTMLDivElement>>('jobList');

  protected readonly jobs = signal<GitlabJob[]>([]);
  protected readonly selectedJobId = signal<number | undefined>(undefined);
  protected readonly scrollToLine = signal<number | undefined>(undefined);
  protected readonly logChunks = signal<string[]>([]);
  protected readonly clearSignal = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly streaming = signal(false);
  protected readonly runningStatuses = RUNNING_STATUSES;

  protected readonly selectedJob = computed(() => this.jobs().find((job) => job.id === this.selectedJobId()));
  protected readonly jobOptions = computed(() =>
    this.jobs().map((job) => ({ label: `${job.name} (${job.status})`, value: job.id })),
  );
  protected readonly subtitle = computed(() => {
    const job = this.selectedJob();
    return job ? job.name : 'No job selected';
  });

  private stream: ResilientSseStream | undefined;
  private isCompleted = false;
  private cumulativeOffset = 0;

  constructor() {
    effect(() => {
      const raw = this.pipelineId();
      if (raw) void this.loadPipeline(Number(raw));
    });

    // When a job is (auto-)selected, bring its chip into view in the stage bar.
    effect(() => {
      this.selectedJobId();
      this.jobs();
      const el = this.jobListEl()?.nativeElement.querySelector('.job-chip-selected');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }

  ngOnDestroy(): void {
    this.stream?.close();
  }

  protected selectJob(job: GitlabJob): void {
    this.closeStream();
    this.selectedJobId.set(job.id);
    this.logChunks.set([]);
    this.clearSignal.set(true);
    this.error.set(undefined);
    this.loading.set(true);
    this.streaming.set(false);
    this.isCompleted = false;
    this.cumulativeOffset = 0;
    this.scrollToLine.set(job.id === this.requestedJobId() ? this.requestedLine() : undefined);
    if (this.scrollToLine() === undefined && this.route.snapshot.queryParamMap.has('line')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { line: null },
        queryParamsHandling: 'merge',
        info: { disableViewTransition: true },
      });
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { job: job.id },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
    this.openStream(job.id);
  }

  protected onJobSelect(id: number): void {
    const job = this.jobs().find((candidate) => candidate.id === id);
    if (job) this.selectJob(job);
  }

  private async loadPipeline(pipelineId: number): Promise<void> {
    this.closeStream();
    this.jobs.set([]);
    this.selectedJobId.set(undefined);
    this.logChunks.set([]);
    this.clearSignal.set(true);
    this.error.set(undefined);
    this.loading.set(true);
    this.streaming.set(false);
    this.isCompleted = false;
    this.cumulativeOffset = 0;
    this.scrollToLine.set(undefined);

    this.appService.updateSeoTags(this.meta, {
      title: `Pipeline #${pipelineId} logs`,
      description: 'Live build logs of a Chaotic-AUR pipeline job',
      keywords: 'Chaotic-AUR, GitLab, pipeline, log, build',
      url: this.router.url,
    });

    try {
      const jobs = await this.logService.getJobs(pipelineId);
      this.jobs.set(jobs);
      const requestedJob = this.requestedJobId();
      const initial =
        jobs.find((job) => job.id === requestedJob) ?? (requestedJob === undefined ? pickInitialJob(jobs) : undefined);
      if (initial) {
        this.selectJob(initial);
      } else {
        this.loading.set(false);
      }
    } catch (error) {
      this.error.set(errorMessage(error));
      this.loading.set(false);
    }
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
    if (!raw) return;
    this.stream?.close();
    this.stream = new ResilientSseStream({
      url: () => this.logService.traceStreamUrl(Number(raw), jobId, this.cumulativeOffset),
      onMessage: (data) => {
        const chunk = parseLogChunk(data);
        if (!chunk) return;
        if (chunk.complete) {
          this.isCompleted = true;
          this.streaming.set(false);
          this.closeStream();
          return;
        }
        // Only once a running job produces output is it actually "live".
        this.loading.set(false);
        this.streaming.set(true);
        if (chunk.text) {
          this.cumulativeOffset = chunk.offset;
          this.logChunks.update((chunks) => [...chunks, chunk.text]);
        }
      },
      onErrorExhausted: () => {
        this.loading.set(false);
        this.streaming.set(false);
        this.error.set('Log stream ended unexpectedly. Please retry in a moment.');
      },
    });
    this.stream.open();
  }

  private closeStream(): void {
    this.stream?.close();
    this.stream = undefined;
  }

  protected onLineClick(line: number): void {
    copyLineLink(line);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { line },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }
}

/**
 * Best job to open first: a running job. Once the pipeline finished, the on-commit
 * job, else any job whose name or stage mentions commit or schedule. Status does not
 * matter; canceled jobs still carry their partial logs.
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
