import { PipelineOperation } from '@chaotic-next/shared-lib';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EventService } from '../events/event.service';
import { Repo } from '../builder/builder.entity';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabPipelineService } from './gitlab-pipeline.service';
import { PipelineTrigger } from './pipeline-trigger.entity';

const ACTOR = { userId: 'test-user', userName: 'Test User' };

type PipelineWebhookFixture = Parameters<GitlabPipelineService['handlePipelineWebhook']>[0];

function pipelineWebhookPayload(attrs: Record<string, unknown>): PipelineWebhookFixture {
  return {
    object_kind: 'pipeline',
    object_attributes: attrs,
  } as unknown as PipelineWebhookFixture;
}

function createService(apiObject: Record<string, unknown> = {}): {
  service: GitlabPipelineService;
  apiService: GitlabApiService;
  pipelineTriggerRepository: {
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  sseNext: ReturnType<typeof vi.fn>;
} {
  const pipelineTriggerRepository = { insert: vi.fn(), update: vi.fn(), findOne: vi.fn() };
  const sseNext = vi.fn();

  const apiService = new GitlabApiService(
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
    { findOne: vi.fn().mockResolvedValue({ gitlabProjectId: 'test-project-id' }) } as unknown as Repository<never>,
  );
  (apiService as unknown as { chaoticId: string }).chaoticId = 'test-project-id';
  (apiService as unknown as { api: unknown }).api = apiObject;

  const service = new GitlabPipelineService(
    { get: vi.fn(), set: vi.fn(), del: vi.fn() } as never,
    apiService,
    { sseEvents$: { next: sseNext } } as unknown as EventService,
    pipelineTriggerRepository as unknown as Repository<PipelineTrigger>,
    {} as Repository<Repo>,
  );
  return { service, apiService, pipelineTriggerRepository, sseNext };
}

describe('GitlabPipelineService.handlePipelineWebhook', () => {
  it('backfills pipeline ID matching commitSha when tracked in unlinkedCommitShas set', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.update.mockResolvedValue({ affected: 1 });
    (service as unknown as { unlinkedCommitShas: Set<string> }).unlinkedCommitShas.add('abc123456');

    await service.handlePipelineWebhook(
      pipelineWebhookPayload({
        id: 9999,
        iid: 12,
        ref: 'main',
        status: 'running',
        source: 'push',
        sha: 'abc123456',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/9999',
      }),
    );

    expect(pipelineTriggerRepository.update).toHaveBeenCalledWith(
      { commitSha: 'abc123456', pipelineId: expect.anything() },
      { pipelineId: 9999 },
    );
    expect((service as unknown as { unlinkedCommitShas: Set<string> }).unlinkedCommitShas.has('abc123456')).toBe(false);
  });

  it('skips commitSha backfill when SHA is not in unlinkedCommitShas set', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.findOne.mockResolvedValue(null);

    await service.handlePipelineWebhook(
      pipelineWebhookPayload({
        id: 8888,
        iid: 14,
        ref: 'main',
        status: 'running',
        source: 'push',
        sha: 'untracked123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/8888',
      }),
    );

    expect(pipelineTriggerRepository.update).not.toHaveBeenCalled();
    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { pipelineId: 8888, commitSha: expect.anything() },
    });
  });

  it('backfills commitSha on trigger with matching pipelineId via reverse webhook lookup', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.findOne.mockResolvedValue({ id: 42, pipelineId: 7777, commitSha: null });
    pipelineTriggerRepository.update.mockResolvedValue({ affected: 1 });

    await service.handlePipelineWebhook(
      pipelineWebhookPayload({
        id: 7777,
        iid: 20,
        ref: 'main',
        status: 'running',
        source: 'schedule',
        sha: 'deadbeef123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/7777',
      }),
    );

    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { pipelineId: 7777, commitSha: expect.anything() },
    });
    expect(pipelineTriggerRepository.update).toHaveBeenCalledWith(42, { commitSha: 'deadbeef123' });
  });

  it('does not backfill commitSha when trigger already has one', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.findOne.mockResolvedValue(null);

    await service.handlePipelineWebhook(
      pipelineWebhookPayload({
        id: 7777,
        iid: 20,
        ref: 'main',
        status: 'running',
        source: 'schedule',
        sha: 'deadbeef123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/7777',
      }),
    );

    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { pipelineId: 7777, commitSha: expect.anything() },
    });
    expect(pipelineTriggerRepository.update).not.toHaveBeenCalled();
  });

  it('backfills schedule trigger with null pipelineId via source fallback', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.update.mockResolvedValue({ affected: 1 });
    pipelineTriggerRepository.findOne
      .mockResolvedValueOnce({ id: 55, pipelineId: null, commitSha: null }) // source fallback
      .mockResolvedValueOnce(null); // reverse match for commitSha

    await service.handlePipelineWebhook(
      pipelineWebhookPayload({
        id: 3333,
        iid: 1,
        ref: 'main',
        status: 'created',
        source: 'schedule',
        sha: 'newschedule123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/3333',
      }),
    );

    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { operation: 'run-schedule', pipelineId: expect.anything(), ref: 'main' },
      order: { createdAt: 'DESC' },
    });
    expect(pipelineTriggerRepository.update).toHaveBeenCalledWith(55, {
      pipelineId: 3333,
      commitSha: 'newschedule123',
    });
  });
});

describe('GitlabPipelineService.runSchedule', () => {
  it('captures pipeline ID and commit SHA from play API response', async () => {
    const schedulesPlay = vi.fn().mockResolvedValue(completePlayResult);
    const { service } = createService({ PipelineSchedules: { play: schedulesPlay } });

    const result = await service.runSchedule(15, 'chaotic-aur', ACTOR);

    expect(schedulesPlay).toHaveBeenCalledWith('test-project-id', 15);
    expect(result.pipelineId).toBe(5555);
    expect(result.status).toBe('scheduled');
    expect(pipelineTriggerInsertOf(service)).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'main',
        commitSha: 'abc123sha',
        operation: PipelineOperation.RUN_SCHEDULE,
        inputs: { scheduleId: '15', repo: 'chaotic-aur' },
        pipelineId: 5555,
      }),
    );
    expect((service as unknown as { unlinkedCommitShas: Set<string> }).unlinkedCommitShas.has('abc123sha')).toBe(true);
  });

  it('falls back to schedule endpoint URL when play response has no last_pipeline', async () => {
    const { service } = createService({
      PipelineSchedules: { play: vi.fn().mockResolvedValue({ data: {} }) },
    });

    const result = await service.runSchedule(15, 'chaotic-aur', ACTOR);

    expect(result.pipelineId).toBe(0);
    expect(result.status).toBe('scheduled');
    expect(pipelineTriggerInsertOf(service)).toHaveBeenCalledWith(
      expect.objectContaining({
        commitSha: null,
        pipelineId: null,
      }),
    );
  });

  it('unwraps gitbeaker response envelope (data property)', async () => {
    const { service } = createService({
      PipelineSchedules: {
        play: vi.fn().mockResolvedValue({
          data: { last_pipeline: { id: 7777, sha: 'inner123', ref: 'main', status: 'created' } },
        }),
      },
    });

    const result = await service.runSchedule(30, 'chaotic-aur', ACTOR);

    expect(result.pipelineId).toBe(7777);
    expect(pipelineTriggerInsertOf(service)).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: 'inner123', pipelineId: 7777 }),
    );
  });
});

const completePlayResult = {
  data: {
    last_pipeline: { id: 5555, sha: 'abc123sha', ref: 'main', status: 'created' },
  },
};

function pipelineTriggerInsertOf(service: GitlabPipelineService): ReturnType<typeof vi.fn> {
  return (service as unknown as { pipelineTriggerRepository: { insert: ReturnType<typeof vi.fn> } })
    .pipelineTriggerRepository.insert;
}

describe('GitlabPipelineService.triggerPipelineRun', () => {
  it('does not record an audit row when the GitLab call fails', async () => {
    const { service, apiService, pipelineTriggerRepository } = createService({
      Pipelines: { create: vi.fn().mockRejectedValue(new Error('GitLab unavailable')) },
    });
    (apiService as unknown as { api: unknown }).api = {
      Pipelines: { create: vi.fn().mockRejectedValue(new Error('GitLab unavailable')) },
    };

    await expect(service.triggerPipelineRun({ operation: 'None' }, 'main', ACTOR)).rejects.toThrow(
      'GitLab unavailable',
    );
    expect(pipelineTriggerRepository.insert).not.toHaveBeenCalled();
  });
});
