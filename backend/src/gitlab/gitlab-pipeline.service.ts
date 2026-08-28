import { Repo } from '../builder/builder.entity';
import { EventService } from '../events/event.service';
import { cachedResult } from '../utils/cache';
import { GitlabApiService, gitlabRawFileToString } from './gitlab-api.service';
import { type GitlabStatusEvent, type MrActor } from './interfaces';
import { PIPELINE_TRIGGERED_BY_VARIABLE } from './pipeline-trigger-inputs';
import { PipelineTrigger } from './pipeline-trigger.entity';
import {
  PipelineOperation,
  PipelineScheduleOption,
  PipelineTriggerResult,
  PipelineWithExternalStatus,
  type ExternalCommitStatus,
  type PipelineWebhookDto,
} from '@chaotic-next/shared-lib';
import { PipelineSchema, type CommitStatusSchema } from '@gitbeaker/rest';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IsNull, Repository } from 'typeorm';

const SKIPPED_PIPELINE_STATUS = 'skipped';
const PIPELINE_SCHEDULES_CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHED_PIPELINES = 40;
const GITLAB_API_TIMEOUT_MS = 10_000;

@Injectable()
export class GitlabPipelineService implements OnModuleInit {
  private readonly pipelineMap = new Map<number, PipelineSchema>();
  private readonly statusMap = new Map<number, ExternalCommitStatus[]>();
  private readonly unlinkedCommitShas = new Set<string>();
  private statusIdCounter = 0;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectPinoLogger(GitlabPipelineService.name) private readonly pino: PinoLogger,
    private readonly gitlabApiService: GitlabApiService,
    private readonly eventService: EventService,
    @InjectRepository(PipelineTrigger)
    private readonly pipelineTriggerRepository: Repository<PipelineTrigger>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
  ) {}

  async onModuleInit(): Promise<void> {
    void this.seedPipelines().catch((err) => this.pino.error({ err }, 'Initial pipeline seed failed'));
  }

  async seedPipelines(): Promise<void> {
    try {
      await this.getPipelinesViaRest();
      this.pino.info({ count: this.pipelineMap.size }, 'Seeded pipelines');
    } catch (err) {
      this.pino.error({ err }, 'Failed to seed pipelines');
    }
  }

  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return [...this.pipelineMap.entries()]
      .filter(([, pipeline]) => pipeline.status !== SKIPPED_PIPELINE_STATUS)
      .map(([id, pipeline]) => ({ pipeline, commit: this.statusMap.get(id) ?? [] }))
      .sort((a, b) => b.pipeline.id - a.pipeline.id)
      .slice(0, MAX_CACHED_PIPELINES);
  }

  private async getPipelinesViaRest(): Promise<void> {
    let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
      maxPages: 2,
      perPage: 100,
    });
    allPipelines = allPipelines
      .filter((pipeline) => pipeline.status !== SKIPPED_PIPELINE_STATUS)
      .slice(0, MAX_CACHED_PIPELINES);

    this.pino.info({ count: allPipelines.length }, 'Fetched pipelines');

    const uniqueShas = [...new Set(allPipelines.map((pipeline) => pipeline.sha))];
    const statusesBySha = new Map<string, CommitStatusSchema[]>();
    await Promise.all(
      uniqueShas.map(async (sha) => {
        try {
          const statuses: CommitStatusSchema[] = await this.api.Commits.allStatuses(this.chaoticId, sha);
          statusesBySha.set(
            sha,
            statuses.filter((status) => this.isExternalStage(status.name)),
          );
        } catch (err) {
          this.pino.warn({ err, sha }, 'Failed to fetch statuses for sha');
          statusesBySha.set(sha, []);
        }
      }),
    );

    this.pipelineMap.clear();
    this.statusMap.clear();
    for (const pipeline of allPipelines) {
      const statuses = statusesBySha.get(pipeline.sha) ?? [];
      this.pipelineMap.set(pipeline.id, pipeline);
      this.statusMap.set(
        pipeline.id,
        statuses
          .filter((status) => status.pipeline_id === pipeline.id)
          .map((status) => this.toExternalStatus(pipeline.id, status)),
      );
    }
  }

  private toExternalStatus(pipelineId: number, status: CommitStatusSchema): ExternalCommitStatus {
    return {
      id: status.id,
      name: status.name,
      status: status.status,
      description: status.description ?? null,
      target_url: status.target_url,
      started_at: status.started_at ?? null,
      finished_at: status.finished_at ?? null,
      pipeline_id: pipelineId,
    };
  }

  private isExternalStage(name: string): boolean {
    return name.startsWith('chaotic-aur:') || name.startsWith('garuda:');
  }

  async handlePipelineWebhook(body: PipelineWebhookDto): Promise<boolean> {
    const attrs = body.object_attributes;
    const existing = this.pipelineMap.get(attrs.id);
    this.pipelineMap.set(attrs.id, {
      ...existing,
      id: attrs.id,
      iid: attrs.iid,
      project_id: existing?.project_id ?? body.project?.id ?? 0,
      ref: attrs.ref,
      status: attrs.status,
      source: attrs.source,
      sha: attrs.sha,
      created_at: attrs.created_at,
      // Webhooks omit updated_at — fall back to created_at to keep the column populated.
      updated_at: existing?.updated_at ?? attrs.created_at,
      web_url: attrs.url,
    });

    if (this.pipelineMap.size > MAX_CACHED_PIPELINES) {
      const sortedIds = [...this.pipelineMap.keys()].sort((a, b) => b - a);
      for (const oldId of sortedIds.slice(MAX_CACHED_PIPELINES)) {
        this.pipelineMap.delete(oldId);
        this.statusMap.delete(oldId);
      }
    }

    if (attrs.sha && this.unlinkedCommitShas.has(attrs.sha)) {
      await this.pipelineTriggerRepository.update(
        { commitSha: attrs.sha, pipelineId: IsNull() },
        { pipelineId: attrs.id },
      );
      this.unlinkedCommitShas.delete(attrs.sha);
    } else if (attrs.source === 'schedule') {
      // Fallback: link to the most recent unlinked RUN_SCHEDULE trigger when the API didn't return pipeline info
      const unlinked = await this.pipelineTriggerRepository.findOne({
        where: { operation: PipelineOperation.RUN_SCHEDULE, pipelineId: IsNull(), ref: attrs.ref },
        order: { createdAt: 'DESC' },
      });
      if (unlinked) {
        await this.pipelineTriggerRepository.update(unlinked.id, { pipelineId: attrs.id, commitSha: attrs.sha });
      }
    }

    if (attrs.sha) {
      const trigger = await this.pipelineTriggerRepository.findOne({
        where: { pipelineId: attrs.id, commitSha: IsNull() },
      });
      if (trigger) {
        await this.pipelineTriggerRepository.update(trigger.id, { commitSha: attrs.sha });
      }
    }

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
    return true;
  }

  async handleExternalStatus(event: GitlabStatusEvent): Promise<void> {
    if (event.pipeline_id === undefined) return;

    const list = this.statusMap.get(event.pipeline_id) ?? [];
    const existingIndex = list.findIndex((status) => status.name === event.name);
    const existing = existingIndex >= 0 ? list[existingIndex] : undefined;

    const entry: ExternalCommitStatus = {
      id: existing?.id ?? this.statusIdCounter++,
      name: event.name,
      status: event.status,
      description: event.description ?? null,
      target_url: event.target_url,
      started_at: event.started_at ?? existing?.started_at ?? null,
      finished_at: event.finished_at ?? existing?.finished_at ?? null,
      pipeline_id: event.pipeline_id,
    };

    if (existingIndex >= 0) list.splice(existingIndex, 1);
    list.push(entry);
    this.statusMap.set(event.pipeline_id, list);

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
  }

  async listPipelineSchedules(repoName: string): Promise<PipelineScheduleOption[]> {
    const gitlabProjectId = await this.gitlabApiService.getRepoGitlabProjectId(repoName);
    return cachedResult(
      this.cacheManager,
      `gitlab:schedules:${repoName}`,
      PIPELINE_SCHEDULES_CACHE_TTL_MS,
      async () => {
        const schedules = await this.api.PipelineSchedules.all(gitlabProjectId, { perPage: 100 });
        return schedules.map((schedule) => ({
          id: schedule.id,
          description: schedule.description ?? null,
          active: schedule.active,
        }));
      },
    );
  }

  async getHeadCommitForRepo(repoName: string, ref = 'main'): Promise<string> {
    const gitlabProjectId = await this.gitlabApiService.getRepoGitlabProjectId(repoName);
    const token = await this.gitlabApiService.getDecryptedToken(repoName);
    return this.fetchHeadCommitFromApi(gitlabProjectId, ref, token);
  }

  private async fetchHeadCommitFromApi(projectId: string, ref: string, token?: string): Promise<string> {
    const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/commits?ref_name=${encodeURIComponent(ref)}&per_page=1`;
    const headers: Record<string, string> = {};
    if (token) {
      headers['PRIVATE-TOKEN'] = token;
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(GITLAB_API_TIMEOUT_MS), headers });
    if (!response.ok) {
      throw new ServiceUnavailableException(`GitLab API returned ${response.status} for project ${projectId}`);
    }
    const commits = (await response.json()) as { id: string }[];
    const head = commits[0];
    if (!head?.id) {
      throw new ServiceUnavailableException('Could not fetch HEAD commit from GitLab');
    }
    return head.id;
  }

  async runSchedule(scheduleId: number, repoName: string, actor: MrActor): Promise<PipelineTriggerResult> {
    const gitlabProjectId = await this.gitlabApiService.getRepoGitlabProjectId(repoName);
    let lastPipeline: { id?: number; sha?: string } | undefined;

    if (scheduleId > 0) {
      this.pino.debug({ scheduleId, repoName }, 'Triggering pipeline schedule');
      const schedules = this.api.PipelineSchedules as unknown as Record<string, (...args: unknown[]) => unknown>;
      let result: unknown;
      if (typeof schedules.play === 'function') {
        result = await schedules.play(gitlabProjectId, scheduleId);
      } else if (typeof schedules.take === 'function') {
        result = await schedules.take(gitlabProjectId, scheduleId);
      } else {
        result = await (this.api as unknown as { requester: { post: (...args: unknown[]) => unknown } }).requester.post(
          `projects/${encodeURIComponent(gitlabProjectId)}/pipeline_schedules/${scheduleId}/play`,
        );
      }

      const body = result as {
        data?: { last_pipeline?: { id?: number; sha?: string } };
        last_pipeline?: { id?: number; sha?: string };
      };
      lastPipeline = body?.data?.last_pipeline ?? body?.last_pipeline;
    }

    const pipelineId = lastPipeline?.id ?? null;
    const commitSha = lastPipeline?.sha ?? null;
    const webUrl = pipelineId
      ? `${gitlabProjectId}/-/pipelines/${pipelineId}`
      : `${gitlabProjectId}/pipeline_schedules`;

    if (commitSha) {
      this.unlinkedCommitShas.add(commitSha);
    }

    await this.pipelineTriggerRepository.insert({
      ref: 'main',
      commitSha,
      operation: PipelineOperation.RUN_SCHEDULE,
      inputs: { scheduleId: String(scheduleId), repo: repoName },
      pipelineId,
      webUrl,
      ...actor,
    });

    return { pipelineId: pipelineId ?? 0, webUrl, status: 'scheduled' };
  }

  async triggerPipelineRun(
    inputs: Record<string, string>,
    ref: string,
    actor: MrActor,
  ): Promise<PipelineTriggerResult> {
    const pipeline = await this.api.Pipelines.create(this.chaoticId, ref, {
      inputs,
      variables: [
        {
          key: PIPELINE_TRIGGERED_BY_VARIABLE,
          value: `${actor.userName} (${actor.userId})`,
          variable_type: 'env_var',
        },
      ],
    });

    await this.pipelineTriggerRepository.insert({
      ref,
      commitSha: pipeline.sha ?? null,
      operation: inputs.operation,
      inputs,
      pipelineId: pipeline.id,
      webUrl: pipeline.web_url,
      ...actor,
    });

    return { pipelineId: pipeline.id, webUrl: pipeline.web_url, status: pipeline.status };
  }

  async fetchCiConfig(repoName: string, pkgbase: string): Promise<string | null> {
    const repo = await this.repoRepository.findOne({ where: { name: repoName } });
    if (!repo?.gitlabProjectId || !this.api) {
      this.pino.warn({ pkgbase, repoName }, 'Cannot fetch .CI/config: repo or GitLab client unavailable');
      return null;
    }

    try {
      const raw = await this.api.RepositoryFiles.showRaw(
        repo.gitlabProjectId,
        `${pkgbase}/.CI/config`,
        repo.gitRef || 'main',
      );
      return await gitlabRawFileToString(raw);
    } catch {
      this.pino.debug({ pkgbase, repoName }, 'No .CI/config found');
      return null;
    }
  }

  registerCommitSha(sha: string): void {
    this.unlinkedCommitShas.add(sha);
  }

  private get api() {
    return this.gitlabApiService.api;
  }

  private get chaoticId(): string {
    return this.gitlabApiService.chaoticId;
  }
}
