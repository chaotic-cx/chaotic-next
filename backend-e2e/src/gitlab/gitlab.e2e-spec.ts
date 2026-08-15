import 'reflect-metadata';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceBroker } from 'moleculer';
import { type Subscriber } from 'rxjs';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '@chaotic-next/backend/app.module';
import { GitlabService } from '@chaotic-next/backend/gitlab/gitlab.service';
import { EventService } from '@chaotic-next/backend/events/event.service';
import type { GitlabStatusEvent, PipelineWebhook } from '@chaotic-next/backend/gitlab/interfaces';
import type { ChaoticEvent, MergeRequestWithDiffs } from '@chaotic-next/shared-lib';

const WEBHOOK_TOKEN = 'test-webhook-token';

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

    it('rejects an invalid object_kind (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/update',
        headers: { 'x-gitlab-token': WEBHOOK_TOKEN },
        payload: { object_kind: 'push' },
      });

      expect(res.statusCode).toBe(400);
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
      const body = (await res.json()) as Array<{ pipeline: { id: number } }>;
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
      const body = (await res.json()) as Array<{ title: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].title).toBe('chore(update): firedragon');
    });

    it('returns an empty array when no MRs are cached', async () => {
      vi.spyOn(gitlabService, 'getOpenMergeRequests').mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url: '/gitlab/merge-requests' });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('GET /gitlab/review-stats (cache-backed)', () => {
    it('returns cached review stats on cache hit', async () => {
      vi.spyOn(gitlabService, 'getReviewStats').mockResolvedValue([{ username: 'dr460nf1r3', reviews: 42 }]);

      const res = await app.inject({ method: 'GET', url: '/gitlab/review-stats' });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as Array<{ username: string; reviews: number }>;
      expect(body).toHaveLength(1);
      expect(body[0].username).toBe('dr460nf1r3');
      expect(body[0].reviews).toBe(42);
    });
  });

  describe('POST /gitlab/approve', () => {
    it('rejects without a token (401)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        payload: { iid: 1, sha: 'abc123' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects an invalid iid (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        headers: { 'x-gitlab-private-token': 'test-token' },
        payload: { iid: -1, sha: 'abc123' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid sha (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        headers: { 'x-gitlab-private-token': 'test-token' },
        payload: { iid: 1, sha: 'not-a-sha' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('approves the MR and busts the cache on valid input', async () => {
      const approveSpy = vi.spyOn(gitlabService, 'approveMergeRequest').mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/approve',
        headers: { 'x-gitlab-private-token': 'valid-token' },
        payload: { iid: 42, sha: '4a70b438f76d' },
      });

      expect(res.statusCode).toBe(201);
      expect(approveSpy).toHaveBeenCalledWith(42, '4a70b438f76d', 'valid-token');
    });
  });

  describe('POST /gitlab/flag', () => {
    it('rejects without a token (401)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/flag',
        payload: { iid: 1, label: 'hold' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects an invalid label (400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/flag',
        headers: { 'x-gitlab-private-token': 'test-token' },
        payload: { iid: 1, label: 'bogus' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('flags the MR and busts the cache on valid input', async () => {
      const flagSpy = vi.spyOn(gitlabService, 'flagMergeRequest').mockResolvedValue(undefined);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/flag',
        headers: { 'x-gitlab-private-token': 'valid-token' },
        payload: { iid: 42, label: 'dangerous' },
      });

      expect(res.statusCode).toBe(201);
      expect(flagSpy).toHaveBeenCalledWith(42, 'dangerous', 'valid-token');
    });
  });

  describe('POST /gitlab/test-token', () => {
    it('rejects without a token (401)', async () => {
      const res = await app.inject({ method: 'POST', url: '/gitlab/test-token' });
      expect(res.statusCode).toBe(401);
    });

    it('returns true when the token has write access', async () => {
      vi.spyOn(gitlabService, 'testToken').mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/test-token',
        headers: { 'x-gitlab-private-token': 'valid-token' },
      });

      expect(res.statusCode).toBe(201);
      expect(await res.json()).toBe(true);
    });

    it('returns false when the token lacks write access', async () => {
      vi.spyOn(gitlabService, 'testToken').mockResolvedValue(false);

      const res = await app.inject({
        method: 'POST',
        url: '/gitlab/test-token',
        headers: { 'x-gitlab-private-token': 'bad-token' },
      });

      expect(res.statusCode).toBe(201);
      expect(await res.json()).toBe(false);
    });
  });
});
