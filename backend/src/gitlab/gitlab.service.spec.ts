import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { GitlabService } from './gitlab.service';
import { PipelineTrigger } from './pipeline-trigger.entity';
import { PIPELINE_TRIGGERED_BY_VARIABLE } from './pipeline-trigger-inputs';

const ACTOR = { userId: 'test-user', userName: 'Test User' };

function fakePipeline(id: number) {
  return {
    id,
    status: 'created',
    web_url: `https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/${id}`,
  };
}

function createService(): {
  service: GitlabService;
  pipelineTriggerRepository: { insert: ReturnType<typeof vi.fn> };
  pipelinesCreate: ReturnType<typeof vi.fn>;
} {
  const pipelinesCreate = vi.fn();
  const pipelineTriggerRepository = { insert: vi.fn() };

  const service = new GitlabService(
    { get: vi.fn(), set: vi.fn(), del: vi.fn() } as never,
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
    { sseEvents$: { next: vi.fn() } } as never,
    {} as Repository<never>,
    {} as Repository<never>,
    pipelineTriggerRepository as unknown as Repository<PipelineTrigger>,
    {} as Repository<never>,
  );
  (service as unknown as { chaoticId: string }).chaoticId = 'test-project-id';
  (service as unknown as { api: unknown }).api = { Pipelines: { create: pipelinesCreate } };
  return { service, pipelineTriggerRepository, pipelinesCreate };
}

describe('GitlabService.triggerPipeline', () => {
  it('triggers the pipeline with inputs and the triggering user as CI variable', async () => {
    const { service, pipelinesCreate, pipelineTriggerRepository } = createService();
    pipelinesCreate.mockResolvedValue(fakePipeline(4711));

    const inputs = { operation: 'Bump Packages', packages: 'nodejs:20' };
    const result = await service.triggerPipeline(inputs, 'main', ACTOR);

    expect(pipelinesCreate).toHaveBeenCalledWith('test-project-id', 'main', {
      inputs,
      variables: [
        {
          key: PIPELINE_TRIGGERED_BY_VARIABLE,
          value: 'Test User (test-user)',
          variable_type: 'env_var',
        },
      ],
    });
    expect(result).toEqual({
      pipelineId: 4711,
      webUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/4711',
      status: 'created',
    });
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith({
      ref: 'main',
      operation: 'Bump Packages',
      inputs,
      pipelineId: 4711,
      webUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/4711',
      ...ACTOR,
    });
  });

  it('does not record an audit row when the GitLab call fails', async () => {
    const { service, pipelinesCreate, pipelineTriggerRepository } = createService();
    pipelinesCreate.mockRejectedValue(new Error('GitLab unavailable'));

    await expect(service.triggerPipeline({ operation: 'None' }, 'main', ACTOR)).rejects.toThrow('GitLab unavailable');
    expect(pipelineTriggerRepository.insert).not.toHaveBeenCalled();
  });
});
