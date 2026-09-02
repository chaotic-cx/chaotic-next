import { BuildStatus } from '@chaotic-next/shared-lib';
import { describe, expect, it, vi } from 'vitest';
import { BuildDependencyIssueSubscriber } from './build-dependency-issue.subscriber';
import { Build } from './builder.entity';

function makeBuild(overrides: Partial<Build> = {}): Build {
  return {
    id: 1,
    status: BuildStatus.FAILED as never,
    failureTags: ['dependency'],
    pkgbase: { id: 10, pkgname: 'foo' } as never,
    pkgbaseId: 10 as never,
    logUrl: 'https://example.com/log',
    ...overrides,
  } as Build;
}

describe('BuildDependencyIssueSubscriber', () => {
  function makeSub(builds: unknown) {
    const config = { get: vi.fn().mockReturnValue('test'), getOrThrow: vi.fn().mockReturnValue('test') } as never;
    const sub = new BuildDependencyIssueSubscriber({ subscribers: [] } as never, builds as never, config as never);
    vi.spyOn(
      sub as unknown as { findOpenRequestIssues: () => Promise<unknown> },
      'findOpenRequestIssues',
    ).mockResolvedValue([]);
    vi.spyOn(sub as unknown as { createIssue: () => Promise<unknown> }, 'createIssue').mockResolvedValue(undefined);
    vi.spyOn(sub as unknown as { createComment: () => Promise<unknown> }, 'createComment').mockResolvedValue(undefined);
    vi.spyOn(sub as unknown as { closeIssue: () => Promise<unknown> }, 'closeIssue').mockResolvedValue(undefined);
    vi.spyOn(sub as unknown as { removeLabel: () => Promise<unknown> }, 'removeLabel').mockResolvedValue(undefined);
    return sub;
  }

  it('creates [Issue] on first dependency failure after success', async () => {
    const builds = {
      find: vi
        .fn()
        .mockResolvedValue([
          makeBuild({ id: 2, status: BuildStatus.FAILED as never, failureTags: ['dependency'] }),
          makeBuild({ id: 1, status: BuildStatus.SUCCESS as never, failureTags: null }),
        ]),
      manager: {
        getRepository: () => ({ findOne: vi.fn().mockResolvedValue({ pkgname: 'foo' }) }),
      },
    } as unknown as never;
    const sub = makeSub(builds);
    await sub.afterInsert({ entity: makeBuild({ id: 2 }) } as never);
    expect((sub as unknown as { createIssue: ReturnType<typeof vi.fn> }).createIssue).toHaveBeenCalledWith(
      '[Issue] foo',
      expect.stringContaining('Build 2 failed'),
      expect.arrayContaining(['request:package-issue']),
    );
  });

  it('does not create duplicate [Issue] if one already open', async () => {
    const builds = {
      find: vi
        .fn()
        .mockResolvedValue([
          makeBuild({ id: 2, status: BuildStatus.FAILED as never }),
          makeBuild({ id: 1, status: BuildStatus.SUCCESS as never, failureTags: null }),
        ]),
      manager: {
        getRepository: () => ({ findOne: vi.fn().mockResolvedValue({ pkgname: 'foo' }) }),
      },
    } as unknown as never;
    const sub = makeSub(builds);
    vi.spyOn(
      sub as unknown as { findOpenRequestIssues: () => Promise<unknown> },
      'findOpenRequestIssues',
    ).mockResolvedValue([{ number: 99, title: '[Issue] foo' }]);
    await sub.afterInsert({ entity: makeBuild({ id: 2 }) } as never);
    expect((sub as unknown as { createIssue: ReturnType<typeof vi.fn> }).createIssue).not.toHaveBeenCalled();
  });

  it('closes [Issue] on success after prior dependency failure', async () => {
    const builds = {
      find: vi
        .fn()
        .mockResolvedValue([
          makeBuild({ id: 3, status: BuildStatus.SUCCESS as never, failureTags: null }),
          makeBuild({ id: 2, status: BuildStatus.FAILED as never, failureTags: ['dependency'] }),
        ]),
      manager: {
        getRepository: () => ({ findOne: vi.fn().mockResolvedValue({ pkgname: 'foo' }) }),
      },
    } as unknown as never;
    const sub = makeSub(builds);
    vi.spyOn(
      sub as unknown as { findOpenRequestIssues: () => Promise<unknown> },
      'findOpenRequestIssues',
    ).mockResolvedValue([{ number: 99, title: '[Issue] foo' }]);
    await sub.afterInsert({
      entity: makeBuild({ id: 3, status: BuildStatus.SUCCESS as never, failureTags: null }),
    } as never);
    expect((sub as unknown as { closeIssue: ReturnType<typeof vi.fn> }).closeIssue).toHaveBeenCalledWith(99);
  });
});
