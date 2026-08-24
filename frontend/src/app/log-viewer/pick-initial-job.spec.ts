import { GitlabJob } from '@chaotic-next/shared-lib';
import { describe, expect, it } from 'vitest';
import { pickInitialJob } from './log-viewer.component';

function job(overrides: Partial<GitlabJob>): GitlabJob {
  return { id: 1, name: 'job', stage: 'process', status: 'success', ref: 'main', webUrl: '', ...overrides };
}

describe('pickInitialJob', () => {
  it('prefers a running job regardless of stage', () => {
    const jobs = [job({ id: 1, stage: 'init' }), job({ id: 2, name: 'on-commit', status: 'running' })];
    expect(pickInitialJob(jobs)?.id).toBe(2);
  });

  it('picks the canceled on-commit job of a finished scheduled pipeline', () => {
    const jobs = [
      job({ id: 16039619093, name: 'do-schedule', stage: 'schedule', status: 'canceled' }),
      job({ id: 16039619092, name: 'on-commit', stage: 'process', status: 'canceled' }),
    ];
    expect(pickInitialJob(jobs)?.id).toBe(16039619092);
  });

  it('falls back to the schedule job when no commit job exists', () => {
    const jobs = [
      job({ id: 1, stage: 'init', status: 'success' }),
      job({ id: 2, name: 'do-schedule', stage: 'schedule', status: 'canceled' }),
    ];
    expect(pickInitialJob(jobs)?.id).toBe(2);
  });

  it('keeps the failed-job fallback when nothing mentions commit or schedule', () => {
    const jobs = [job({ id: 1, stage: 'init', status: 'success' }), job({ id: 2, stage: 'init', status: 'failed' })];
    expect(pickInitialJob(jobs)?.id).toBe(2);
  });
});
