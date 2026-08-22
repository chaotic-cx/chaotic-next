import 'reflect-metadata';
import { AppModule } from '@chaotic-next/backend/app.module';
import { Repo } from '@chaotic-next/backend/builder/builder.entity';
import { EventService } from '@chaotic-next/backend/events/event.service';
import { GitlabService } from '@chaotic-next/backend/gitlab/gitlab.service';
import type { GitlabStatusEvent, PipelineWebhook } from '@chaotic-next/backend/gitlab/interfaces';
import { MrAction } from '@chaotic-next/backend/gitlab/mr-action.entity';
import { PipelineTrigger } from '@chaotic-next/backend/gitlab/pipeline-trigger.entity';
import { encryptAes } from '@chaotic-next/backend/utils/functions';
import {
  type ChaoticEvent,
  type MergeRequestWithDiffs,
  PipelineOperation,
  type PipelineTriggerResult,
} from '@chaotic-next/shared-lib';
import { CanActivate, type ExecutionContext } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { ServiceBroker } from 'moleculer';
import { type Subscriber } from 'rxjs';
import { DataSource } from 'typeorm';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const WEBHOOK_TOKEN = 'test-webhook-token';

class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ session: unknown }>();
    request.session = { user: { id: 'test-user', name: 'Test User' } };
    return true;
  }
}

function pipelineWebhook(overrides: Partial<PipelineWebhook['object_attributes']> & { id: number }): PipelineWebhook {
  return {
    object_kind: 'pipeline',
    object_attributes: {
      id: overrides.id,
      iid: overrides.id,
      name: 'main',
      ref: 'refs/heads/main',
      tag: false,
      sha: overrides.sha ?? '4a70b438f76d5c8f6f739ea110f8c071efe8067f',
      before_sha: '0000000000000000000000000000000000000000',
      source: overrides.source ?? 'push',
      status: overrides.status ?? 'success',
      stages: [],
      created_at: overrides.created_at ?? '2025-12-01T10:00:00.000Z',
      finished_at: overrides.finished_at ?? '2025-12-01T10:05:00.000Z',
      duration: overrides.duration ?? 300,
      variables: [],
      url: overrides.url ?? 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/1001',
    },
    merge_request: undefined as never,
    user: undefined as never,
    project: undefined as never,
    commit: undefined as never,
    source_pipeline: undefined as never,
    builds: undefined as never,
  } as PipelineWebhook;
}

function statusEvent(overrides: Partial<GitlabStatusEvent> & { pipeline_id: number }): GitlabStatusEvent {
  return {
    pipeline_id: overrides.pipeline_id,
    name: overrides.name ?? 'chaotic-aur:firedragon',
    status: overrides.status ?? 'success',
    description: overrides.description ?? 'Build succeeded',
    target_url: overrides.target_url ?? 'https://builds.garudalinux.org/logs/firedragon.html',
    started_at: overrides.started_at !== undefined ? overrides.started_at : '2025-12-01T10:00:00.000Z',
    finished_at: overrides.finished_at !== undefined ? overrides.finished_at : '2025-12-01T10:03:00.000Z',
  };
}

describe('GitLab pipeline events (e2e, real PostgreSQL)', () => {
  let app: NestFastifyApplication;
  let broker: ServiceBroker;
  let gitlabService: GitlabService;
  let eventService: EventService;
  let sseSubscriber: Subscriber<Partial<MessageEvent<ChaoticEvent>>>;
  let sseEvents: Partial<MessageEvent<ChaoticEvent>>[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(AuthGuard)
      .useClass(FakeAuthGuard)
      .compile();

    const dataSource = moduleRef.get<DataSource>(DataSource);
    if (!dataSource.isInitialized) await dataSource.initialize();
    await dataSource.getRepository(Repo).save({
      name: 'chaotic-aur',
      gitlabProjectId: 'test-project-id',
      apiToken: encryptAes('test-gitlab-token', process.env.CAUR_DB_KEY ?? ''),
    });

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.listen(0);

    gitlabService = app.get<GitlabService>(GitlabService);
    eventService = app.get<EventService>(EventService);

    broker = new ServiceBroker({ logger: false, skipProcessEventRegistration: true });
    await broker.start();

    sseEvents = [];
    sseSubscriber = eventService.sseEvents$.subscribe((e) => sseEvents.push(e)) as Subscriber<
      Partial<MessageEvent<ChaoticEvent>>
    >;
  });

  afterAll(async () => {
    sseSubscriber?.unsubscribe();
    await broker?.stop();
    await app.close();
  });

  beforeEach(async () => {
    sseEvents = [];
    (gitlabService as unknown as { pipelineMap: Map<number, unknown> }).pipelineMap.clear();
    (gitlabService as unknown as { statusMap: Map<number, unknown> }).statusMap.clear();
  });

  async function seedPipelineViaRest(pipelineId: number, sha: string, status = 'success') {
    const api = gitlabService.api;
    vi.spyOn(api.Pipelines, 'all').mockResolvedValue([
      {
        id: pipelineId,
        sha,
        status,
        ref: 'main',
        created_at: '2025-12-01T10:00:00Z',
        web_url: `https://gitlab.com/pipelines/${pipelineId}`,
      },
    ] as never);
    vi.spyOn(api.Commits, 'allStatuses').mockResolvedValue([] as never);
    await gitlabService.seedPipelines();
  }

  describe('handleExternalStatus (broker gitlab.status event)', () => {
    it('appends a new status to the cache and emits a pipeline SSE event', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(statusEvent({ pipeline_id: 1001 }));

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines).toHaveLength(1);
      expect(pipelines[0].pipeline.id).toBe(1001);
      expect(pipelines[0].commit).toHaveLength(1);
      expect(pipelines[0].commit[0].name).toBe('chaotic-aur:firedragon');
      expect(pipelines[0].commit[0].status).toBe('success');

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].data).toMatchObject({ type: 'pipeline' });
    });

    it('updates an existing status in-place by name (no duplicate)', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(
        statusEvent({ pipeline_id: 1001, name: 'chaotic-aur:firedragon', status: 'running' }),
      );
      await gitlabService.handleExternalStatus(
        statusEvent({ pipeline_id: 1001, name: 'chaotic-aur:firedragon', status: 'success' }),
      );

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines[0].commit).toHaveLength(1);
      expect(pipelines[0].commit[0].status).toBe('success');
    });

    it('preserves the id on update, assigns a synthetic id on first insert', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(statusEvent({ pipeline_id: 1001, name: 'chaotic-aur:firedragon' }));
      const firstPipelines = await gitlabService.getLastPipelines();
      const firstId = firstPipelines[0].commit[0].id;

      await gitlabService.handleExternalStatus(
        statusEvent({ pipeline_id: 1001, name: 'chaotic-aur:firedragon', status: 'failed' }),
      );
      const updatedPipelines = await gitlabService.getLastPipelines();
      expect(updatedPipelines[0].commit[0].id).toBe(firstId);
    });

    it('ignores events with undefined pipeline_id', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(statusEvent({ pipeline_id: undefined as unknown as number }));

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines[0].commit).toHaveLength(0);
      expect(sseEvents).toHaveLength(0);
    });

    it('handles multiple distinct status names for the same pipeline', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(statusEvent({ pipeline_id: 1001, name: 'chaotic-aur:firedragon' }));
      await gitlabService.handleExternalStatus(statusEvent({ pipeline_id: 1001, name: 'garuda:linux-cachyos' }));

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines[0].commit).toHaveLength(2);
    });

    it('status for an unseeded pipeline_id is stored but invisible in getLastPipelines', async () => {
      await gitlabService.handleExternalStatus(statusEvent({ pipeline_id: 9999 }));

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines).toHaveLength(0);
    });

    it('preserves existing started_at/finished_at when event has nulls', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(
        statusEvent({
          pipeline_id: 1001,
          name: 'chaotic-aur:firedragon',
          started_at: '2025-12-01T10:00:00.000Z',
          finished_at: '2025-12-01T10:03:00.000Z',
        }),
      );

      await gitlabService.handleExternalStatus(
        statusEvent({
          pipeline_id: 1001,
          name: 'chaotic-aur:firedragon',
          started_at: null,
          finished_at: null,
        }),
      );

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines[0].commit[0].started_at).toBe('2025-12-01T10:00:00.000Z');
      expect(pipelines[0].commit[0].finished_at).toBe('2025-12-01T10:03:00.000Z');
    });

    it('sets started_at/finished_at to null on first insert when event has nulls', async () => {
      await seedPipelineViaRest(1001, 'abc123def456');

      await gitlabService.handleExternalStatus(
        statusEvent({
          pipeline_id: 1001,
          name: 'chaotic-aur:firedragon',
          started_at: null,
          finished_at: null,
        }),
      );

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines[0].commit[0].started_at).toBeNull();
      expect(pipelines[0].commit[0].finished_at).toBeNull();
    });
  });

  describe('handlePipelineWebhook (POST /gitlab/update)', () => {
    it('inserts a pipeline into the cache via webhook and emits SSE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 2001, status: 'success' }),
      });

      expect(res.statusCode).toBe(201);

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines).toHaveLength(1);
      expect(pipelines[0].pipeline.id).toBe(2001);
      expect(pipelines[0].pipeline.status).toBe('success');

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].data).toMatchObject({ type: 'pipeline' });
    });

    it('updates an existing pipeline via webhook without duplicating', async () => {
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 2001, status: 'running' }),
      });
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 2001, status: 'success' }),
      });

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines).toHaveLength(1);
      expect(pipelines[0].pipeline.status).toBe('success');
    });

    it('rejects a request with wrong token (401)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': 'wrong-token' },
        payload: pipelineWebhook({ id: 2001 }),
      });

      expect(res.statusCode).toBe(401);
    });

    it('caps the cache to the latest 40 pipelines when more arrive via webhook', async () => {
      // Seed 40 pipelines: IDs 1..40
      for (let i = 1; i <= 40; i++) {
        await app.inject({
          method: 'POST',
          url: '/gitlab/update',
          headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
          payload: pipelineWebhook({ id: i, status: 'success' }),
        });
      }

      let pipelines = await gitlabService.getLastPipelines();
      expect(pipelines).toHaveLength(40);
      expect(pipelines.map((p) => p.pipeline.id)).toContain(1);

      // Insert 41st and 42nd pipeline
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 41, status: 'success' }),
      });
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 42, status: 'success' }),
      });

      pipelines = await gitlabService.getLastPipelines();
      expect(pipelines).toHaveLength(40);
      const ids = pipelines.map((p) => p.pipeline.id);
      expect(ids[0]).toBe(42);
      expect(ids[1]).toBe(41);
      expect(ids).not.toContain(1);
      expect(ids).not.toContain(2);
    });
  });

  describe('GET /gitlab/pipelines/:pipelineId/jobs', () => {
    it('maps GitLab jobs to the log-viewer shape', async () => {
      vi.spyOn(gitlabService.api.Jobs, 'all').mockResolvedValue([
        {
          id: 501,
          name: 'build:firedragon',
          stage: 'build',
          status: 'success',
          ref: 'main',
          web_url: 'https://gitlab.com/jobs/501',
          started_at: '2026-08-16T10:00:00Z',
          finished_at: '2026-08-16T10:03:00Z',
          duration: 180,
        },
      ] as never);

      const res = await app.inject({ method: 'GET', url: '/gitlab/pipelines/42/jobs' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as {
        id: number;
        name: string;
        stage: string;
        status: string;
        webUrl: string;
      }[];
      expect(body).toEqual([
        {
          id: 501,
          name: 'build:firedragon',
          stage: 'build',
          status: 'success',
          ref: 'main',
          webUrl: 'https://gitlab.com/jobs/501',
          startedAt: '2026-08-16T10:00:00Z',
          finishedAt: '2026-08-16T10:03:00Z',
          duration: 180,
        },
      ]);
    });
  });

  describe('GET /gitlab/pipelines (cache read)', () => {
    it('returns pipelines sorted by id descending', async () => {
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 1001 }),
      });
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 3001 }),
      });
      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 2001 }),
      });

      const res = await app.inject({ method: 'GET', url: '/gitlab/pipelines' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { pipeline: { id: number } }[];
      expect(body.map((p) => p.pipeline.id)).toEqual([3001, 2001, 1001]);
    });

    it('returns an empty array when the cache is empty', async () => {
      const res = await app.inject({ method: 'GET', url: '/gitlab/pipelines' });
      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('gitlab.status updates the matching pipeline', () => {
    it('maps a status event to its pipeline, records the commit, and emits a pipeline SSE event', async () => {
      await seedPipelineViaRest(5001, 'feedface');

      const pipelinesBefore = await gitlabService.getLastPipelines();
      expect(pipelinesBefore).toHaveLength(1);

      const payload = statusEvent({ pipeline_id: 5001, name: 'chaotic-aur:google-chrome' });
      await gitlabService.handleExternalStatus(payload);

      const pipelines = await gitlabService.getLastPipelines();
      expect(pipelines[0].commit).toHaveLength(1);
      expect(pipelines[0].commit[0].name).toBe('chaotic-aur:google-chrome');

      const ssePipeline = sseEvents.find((e) => (e.data as { type?: string })?.type === 'pipeline');
      expect(ssePipeline?.data).toMatchObject({ type: 'pipeline' });
    });
  });

  describe('GET /gitlab/merge-requests (cache-backed)', () => {
    it('returns cached merge requests on cache hit', async () => {
      const cachedMrs: MergeRequestWithDiffs[] = [
        {
          id: 1,
          iid: 1,
          title: 'chore(update): firedragon',
          state: 'opened',
          web_url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests/1',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          assignees: [],
          sha: 'abc123',
          merge_status: 'unchecked',
          detailed_merge_status: 'unchecked',
          labels: [],
          diffs: [],
        },
      ];
      vi.spyOn(gitlabService, 'getOpenMergeRequests').mockResolvedValue(cachedMrs);

      const res = await app.inject({ method: 'GET', url: '/gitlab/merge-requests' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { title: string }[];
      expect(body).toHaveLength(1);
      expect(body[0].title).toBe('chore(update): firedragon');
    });

    it('returns an empty array when no MRs are cached', async () => {
      vi.spyOn(gitlabService, 'getOpenMergeRequests').mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/gitlab/merge-requests' });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('attaches security scan findings to MRs fetched from the GitLab API', async () => {
      const api = gitlabService.api;
      vi.spyOn(api.MergeRequests, 'all').mockResolvedValue([
        {
          id: 2,
          iid: 2,
          title: 'chore(update): evilpkg',
          state: 'opened',
          web_url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests/2',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          assignees: [],
          sha: 'feedface',
          labels: ['human-review'],
          merge_status: 'can_be_merged',
          detailed_merge_status: 'not_approved',
        },
      ] as never);
      vi.spyOn(api.MergeRequests, 'allDiffs').mockResolvedValue([
        {
          old_path: 'evilpkg/evilpkg.install',
          new_path: 'evilpkg/evilpkg.install',
          a_mode: '100644',
          b_mode: '100644',
          new_file: true,
          renamed_file: false,
          deleted_file: false,
          diff: ['@@ -0,0 +1,3 @@', '+post_install() {', '+  npm install atomic-lockfile', '+}'].join('\n'),
        },
      ] as never);

      await gitlabService.getOpenMergeRequests(true);
      const res = await app.inject({ method: 'GET', url: '/gitlab/merge-requests' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { scanFindings?: { ruleId: string; severity: string }[] }[];
      const ruleIds = body[0]?.scanFindings?.map((finding) => finding.ruleId);
      expect(ruleIds).toContain('CAUR-INSTALL-NEW');
      expect(ruleIds).toContain('NPM-001');
      expect(ruleIds).toContain('NPM-002');
    });
  });

  describe('GET /gitlab/review-stats (cache-backed)', () => {
    it('returns cached review stats on cache hit', async () => {
      vi.spyOn(gitlabService, 'getReviewStats').mockResolvedValue([{ username: 'dr460nf1r3', reviews: 42 }]);

      const res = await app.inject({ method: 'GET', url: '/gitlab/review-stats' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { username: string; reviews: number }[];
      expect(body).toHaveLength(1);
      expect(body[0].username).toBe('dr460nf1r3');
      expect(body[0].reviews).toBe(42);
    });
  });

  describe('POST /gitlab/approve', () => {
    it('rejects an invalid iid (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        payload: { iid: -1, sha: 'abc123' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid sha (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        payload: { iid: 1, sha: 'not-a-sha' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('approves the MR and busts the cache on valid input', async () => {
      const approveSpy = vi.spyOn(gitlabService, 'approveMergeRequest').mockResolvedValue({ deferred: false });

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        payload: { iid: 42, sha: '4a70b438f76d' },
      });

      expect(res.statusCode).toBe(201);
      expect(approveSpy).toHaveBeenCalledWith(42, '4a70b438f76d', { userId: 'test-user', userName: 'Test User' });
    });
  });

  describe('POST /gitlab/flag', () => {
    it('rejects an invalid label (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/flag',
        payload: { iid: 1, label: 'bogus' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('flags the MR and busts the cache on valid input', async () => {
      const flagSpy = vi.spyOn(gitlabService, 'flagMergeRequest').mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/flag',
        payload: { iid: 42, label: 'dangerous' },
      });

      expect(res.statusCode).toBe(201);
      expect(flagSpy).toHaveBeenCalledWith(42, 'dangerous', { userId: 'test-user', userName: 'Test User' });
    });
  });

  describe('GET /gitlab/schedules', () => {
    it('returns all pipeline schedules including inactive ones', async () => {
      vi.spyOn(gitlabService.api.PipelineSchedules, 'all').mockResolvedValue([
        { id: 13, description: 'Daily rebuilds', active: true },
        { id: 14, description: 'One-off cleanup', active: false },
        { id: 15, description: null, active: false },
      ] as never);

      const res = await app.inject({ method: 'GET', url: '/gitlab/schedules' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { id: number; description: string | null; active: boolean }[];
      expect(body).toEqual([
        { id: 13, description: 'Daily rebuilds', active: true },
        { id: 14, description: 'One-off cleanup', active: false },
        { id: 15, description: null, active: false },
      ]);
      expect(vi.mocked(gitlabService.api.PipelineSchedules.all).mock.calls[0][1]).not.toHaveProperty('scope');
    });
  });

  describe('GET /gitlab/review-stats', () => {
    it('returns approval stats per user filtered by time range', async () => {
      const ds = app.get<DataSource>(DataSource);
      const mrActionRepo = ds.getRepository(MrAction);
      const now = new Date();
      await mrActionRepo.save([
        {
          action: 'approve',
          mergeRequestIid: 1,
          userId: 'user1',
          userName: 'Alice',
          createdAt: now,
        },
        {
          action: 'approve',
          mergeRequestIid: 2,
          userId: 'user2',
          userName: 'Bob',
          createdAt: now,
        },
      ]);

      const res = await app.inject({ method: 'GET', url: '/gitlab/review-stats?days=30' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { username: string; reviews: number }[];
      expect(body).toHaveLength(2);
      expect(body.find((u) => u.username === 'Alice')?.reviews).toBe(1);
      expect(body.find((u) => u.username === 'Bob')?.reviews).toBe(1);
    });
  });

  describe('GET /gitlab/review-stats/over-time', () => {
    it('returns approval stats per user grouped by date', async () => {
      const ds = app.get<DataSource>(DataSource);
      const mrActionRepo = ds.getRepository(MrAction);
      const now = new Date();
      await mrActionRepo.save({
        action: 'approve',
        mergeRequestIid: 1,
        userId: 'user1',
        userName: 'Alice',
        createdAt: now,
      });

      const res = await app.inject({ method: 'GET', url: '/gitlab/review-stats/over-time?days=30' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { date: string; username: string; reviews: number }[];
      expect(body.length).toBeGreaterThanOrEqual(1);
      const aliceEntry = body.find((r) => r.username === 'Alice');
      expect(aliceEntry).toBeDefined();
      expect(aliceEntry?.reviews).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /gitlab/trigger (validation, mocked service)', () => {
    it('rejects a missing operation (400)', async () => {
      const res = await app.inject({ method: 'POST', url: '/gitlab/trigger', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown operation (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'Explode Packages' },
      });
      expect(res.statusCode).toBe(400);
    });

    it.each(['bump-packages', 'schedule-packages', 'drop-packages'])(
      'rejects a missing packages input for %s (400)',
      async (operation) => {
        const res = await app.inject({ method: 'POST', url: '/gitlab/trigger', payload: { operation } });
        expect(res.statusCode).toBe(400);
      },
    );

    it('rejects a missing trigger input for run-schedule (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'run-schedule' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an incomplete add-packages request (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'add-packages', add_packages: 'paru/aur' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid packages format (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'bump-packages', packages: 'a;b' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('forwards validated inputs and the session user to the service (201)', async () => {
      const triggerSpy = vi.spyOn(gitlabService, 'triggerPipelineRun').mockResolvedValue({
        pipelineId: 4711,
        webUrl: 'https://gitlab.com/pipelines/4711',
        status: 'created',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'bump-packages', packages: 'nodejs:20', ref: 'dev' },
      });

      expect(res.statusCode).toBe(201);
      expect(triggerSpy).toHaveBeenCalledWith({ operation: 'Bump Packages', packages: 'nodejs:20' }, 'dev', {
        userId: 'test-user',
        userName: 'Test User',
      });
      const body = (await res.json()) as PipelineTriggerResult;
      expect(body.pipelineId).toBe(4711);
    });
  });

  describe('POST /gitlab/trigger (real service, mocked GitLab API)', () => {
    it('creates the pipeline, records who triggered it, and persists an audit row', async () => {
      const createSpy = vi.spyOn(gitlabService.api.Pipelines, 'create').mockResolvedValue({
        id: 4712,
        status: 'created',
        web_url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/4712',
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'add-packages', add_packages: 'paru/aur', request_origin: 'github/5678' },
      });

      expect(res.statusCode).toBe(201);
      expect(createSpy).toHaveBeenCalledWith(gitlabService.chaoticId, 'main', {
        inputs: { operation: 'Add Packages', add_packages: 'paru/aur', request_origin: 'github/5678' },
        variables: [
          {
            key: 'PIPELINE_TRIGGERED_BY',
            value: 'Test User (test-user)',
            variable_type: 'env_var',
          },
        ],
      });

      const triggerRepository = app.get(DataSource).getRepository(PipelineTrigger);
      const rows = await triggerRepository.find({ where: { pipelineId: 4712 } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        ref: 'main',
        operation: 'Add Packages',
        inputs: { operation: 'Add Packages', add_packages: 'paru/aur', request_origin: 'github/5678' },
        webUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/4712',
        userId: 'test-user',
        userName: 'Test User',
      });
      await triggerRepository.clear();
    });
  });

  describe('POST /gitlab/run-schedule (real service, mocked GitLab API)', () => {
    it('captures pipeline ID and commit SHA from play API response', async () => {
      const playMock = vi.fn().mockResolvedValue({
        id: 15,
        description: 'Test schedule',
        ref: 'main',
        cron: '0 * * * *',
        cron_timezone: 'UTC',
        next_run_at: '2026-08-21T23:00:00Z',
        active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-08-21T22:00:00Z',
        owner: { id: 1, username: 'admin', name: 'Admin', state: 'active', avatar_url: '', web_url: '' },
        last_pipeline: { id: 8888, sha: 'deadbeef1234', ref: 'main', status: 'created' },
      } as never);
      (gitlabService.api.PipelineSchedules as unknown as Record<string, unknown>).play = playMock;

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/run-schedule',
        payload: { scheduleId: 15 },
      });

      expect(res.statusCode).toBe(201);
      expect(playMock).toHaveBeenCalledWith('test-project-id', 15);

      const body = (await res.json()) as PipelineTriggerResult;
      expect(body.pipelineId).toBe(8888);
      expect(body.status).toBe('scheduled');

      const triggerRepository = app.get(DataSource).getRepository(PipelineTrigger);
      const rows = await triggerRepository.find({ where: { pipelineId: 8888 } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        ref: 'main',
        commitSha: 'deadbeef1234',
        pipelineId: 8888,
        operation: PipelineOperation.RUN_SCHEDULE,
        userId: 'test-user',
        userName: 'Test User',
      });
      await triggerRepository.clear();
    });

    it('records a trigger with null pipelineId when play response lacks last_pipeline', async () => {
      (gitlabService.api.PipelineSchedules as unknown as Record<string, unknown>).play = vi.fn().mockResolvedValue({
        id: 15,
        description: 'Test schedule',
        ref: 'main',
        cron: '0 * * * *',
        cron_timezone: 'UTC',
        next_run_at: '2026-08-21T23:00:00Z',
        active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-08-21T22:00:00Z',
        owner: { id: 1, username: 'admin', name: 'Admin', state: 'active', avatar_url: '', web_url: '' },
      } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/run-schedule',
        payload: { scheduleId: 15 },
      });

      expect(res.statusCode).toBe(201);
      const body = (await res.json()) as PipelineTriggerResult;
      expect(body.pipelineId).toBe(0);

      const triggerRepository = app.get(DataSource).getRepository(PipelineTrigger);
      const rows = await triggerRepository.find({ where: { operation: PipelineOperation.RUN_SCHEDULE } });
      expect(rows).toHaveLength(1);
      expect(rows[0].pipelineId).toBeNull();
      expect(rows[0].commitSha).toBeNull();
      await triggerRepository.clear();
    });
  });

  describe('webhook backfills schedule trigger (reverse linkage)', () => {
    it('backfills commitSha on schedule trigger when webhook arrives with matching pipelineId', async () => {
      const triggerRepository = app.get(DataSource).getRepository(PipelineTrigger);
      const trigger = await triggerRepository.save({
        ref: 'main',
        commitSha: null,
        operation: PipelineOperation.RUN_SCHEDULE,
        inputs: { scheduleId: '15' },
        pipelineId: 9999,
        webUrl: 'https://gitlab.com/test-project-id/-/pipelines/9999',
        userId: 'test-user',
        userName: 'Test User',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 9999, sha: 'backfilled123', source: 'schedule' }),
      });

      expect(res.statusCode).toBe(201);

      const updated = (await triggerRepository.findOne({ where: { id: trigger.id } })) as PipelineTrigger;
      expect(updated).toBeDefined();
      expect(updated.commitSha).toBe('backfilled123');
      expect(updated.pipelineId).toBe(9999);

      await triggerRepository.clear();
    });

    it('does not overwrite existing commitSha on webhook backfill', async () => {
      const triggerRepository = app.get(DataSource).getRepository(PipelineTrigger);
      const trigger = await triggerRepository.save({
        ref: 'main',
        commitSha: 'original_sha',
        operation: PipelineOperation.RUN_SCHEDULE,
        inputs: { scheduleId: '15' },
        pipelineId: 8888,
        webUrl: 'https://gitlab.com/test-project-id/-/pipelines/8888',
        userId: 'test-user',
        userName: 'Test User',
      });

      await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: pipelineWebhook({ id: 8888, sha: 'should_not_overwrite', source: 'schedule' }),
      });

      const updated = (await triggerRepository.findOne({ where: { id: trigger.id } })) as PipelineTrigger;
      expect(updated.commitSha).toBe('original_sha');

      await triggerRepository.clear();
    });
  });
});
