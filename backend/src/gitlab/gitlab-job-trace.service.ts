import { cachedResult } from '../utils/cache';
import { CACHE_TTL_MS } from '../utils/constants';
import { type SseMessage, withSseKeepalive } from '../utils/sse';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabJob, GitlabLogChunk } from '@chaotic-next/shared-lib';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

const TERMINAL_JOB_STATUSES = ['success', 'failed', 'canceled', 'skipped', 'manual', 'waiting_for_resource'];
const JOB_TRACE_POLL_MS = 2000;
const PIPELINE_JOBS_CACHE_TTL_MS = CACHE_TTL_MS;

interface JobTraceClient {
  lastOffset: number;
  next: (message: SseMessage<GitlabLogChunk>) => void;
  complete: () => void;
  error: (err: unknown) => void;
}

interface JobTraceEntry {
  clients: Set<JobTraceClient>;
  timer?: ReturnType<typeof setInterval>;
  trace: string;
  status?: string;
}

@Injectable()
export class GitlabJobTraceService {
  private readonly jobTraces = new Map<string, JobTraceEntry>();

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly gitlabApiService: GitlabApiService,
  ) {}

  async listPipelineJobs(pipelineId: number): Promise<GitlabJob[]> {
    return cachedResult(
      this.cacheManager,
      `gitlab:pipeline-jobs:${pipelineId}`,
      PIPELINE_JOBS_CACHE_TTL_MS,
      async () => {
        const { api, chaoticId } = this.gitlabApiService;
        const jobs = await api.Jobs.all(chaoticId, { pipelineId });
        return jobs.map((job) => ({
          id: job.id,
          name: job.name,
          stage: job.stage,
          status: job.status,
          ref: job.ref,
          webUrl: job.web_url,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
          duration: job.duration,
        }));
      },
    );
  }

  /**
   * Streams a job's trace over SSE. One shared polling loop feeds every viewer
   * of the same job: GitLab's trace is fetched as a whole, so the poller keeps
   * the latest trace and forwards each client only the bytes appended after its
   * own offset, ending with a `complete` message once the job reaches a terminal
   * status. The polling stops when the job finishes or the last client leaves.
   */
  getJobTraceStream(pipelineId: number, jobId: number, resumeAt = 0): Observable<SseMessage<GitlabLogChunk>> {
    const key = `${pipelineId}:${jobId}`;
    return withSseKeepalive(
      new Observable<SseMessage<GitlabLogChunk>>((subscriber) => {
        const client: JobTraceClient = {
          // Seeds from the resume point so a reconnecting client only receives
          // bytes appended after its last received chunk.
          lastOffset: Math.max(resumeAt, 0),
          next: (message) => subscriber.next(message),
          complete: () => subscriber.complete(),
          error: (err) => subscriber.error(err),
        };
        this.attachJobTraceClient(key, jobId, client);
        return () => this.detachJobTraceClient(key, client);
      }),
    );
  }

  private attachJobTraceClient(key: string, jobId: number, client: JobTraceClient): void {
    let entry = this.jobTraces.get(key);
    if (!entry) {
      entry = { clients: new Set(), trace: '', status: undefined };
      this.jobTraces.set(key, entry);
      entry.timer = setInterval(() => void this.pollJobTrace(key, jobId), JOB_TRACE_POLL_MS);
      void this.pollJobTrace(key, jobId);
    } else {
      // Catch a mid-stream joiner up from the buffered trace immediately.
      this.sendJobTraceChunk(entry, client);
    }
    entry.clients.add(client);
  }

  private detachJobTraceClient(key: string, client: JobTraceClient): void {
    const entry = this.jobTraces.get(key);
    if (!entry) return;
    entry.clients.delete(client);
    if (entry.clients.size === 0) this.disposeJobTrace(key);
  }

  private sendJobTraceChunk(entry: JobTraceEntry, client: JobTraceClient): void {
    if (entry.trace.length <= client.lastOffset) return;
    const offset = entry.trace.length;
    // The id carries the offset so the browser's native EventSource reconnect
    // resumes via Last-Event-ID without manual bookkeeping.
    client.next({
      id: String(offset),
      data: { offset, text: entry.trace.slice(client.lastOffset), complete: false, status: entry.status ?? '' },
    });
    client.lastOffset = offset;
  }

  private async pollJobTrace(key: string, jobId: number): Promise<void> {
    const entry = this.jobTraces.get(key);
    if (!entry) return;

    try {
      this.gitlabApiService.assertApiReady();
      const { api, chaoticId } = this.gitlabApiService;
      const job = await api.Jobs.show(chaoticId, jobId);
      entry.status = job.status;
      entry.trace = await api.Jobs.showLog(chaoticId, jobId);

      for (const client of [...entry.clients]) {
        this.sendJobTraceChunk(entry, client);
        if (TERMINAL_JOB_STATUSES.includes(entry.status)) {
          client.next({
            data: { offset: client.lastOffset, text: '', complete: true, status: entry.status ?? '' },
          });
          client.complete();
        }
      }
      if (TERMINAL_JOB_STATUSES.includes(entry.status)) this.disposeJobTrace(key);
    } catch (error) {
      for (const client of [...entry.clients]) client.error(error);
      this.disposeJobTrace(key);
    }
  }

  private disposeJobTrace(key: string): void {
    const entry = this.jobTraces.get(key);
    if (!entry) return;
    if (entry.timer !== undefined) clearInterval(entry.timer);
    this.jobTraces.delete(key);
  }
}
