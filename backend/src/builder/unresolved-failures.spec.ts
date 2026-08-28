import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CACHE_TTL_MS } from '../utils/constants';
import { BuildStatus } from '../types/types';
import { BUILD_VERDICT_STATUSES, isValidPkgname } from '@chaotic-next/shared-lib';
import { Build, Builder, Package, Repo, SilencedBuildFailure } from './builder.entity';
import { BuilderService } from './builder.service';
import { type EntityLookupService } from './entity-lookup.service';
import {
  isFailingStatus,
  shouldBuildDecision,
  unresolvedFailedBuildFromRow,
  type UnresolvedFailureRow,
} from './unresolved-failures';

describe('status classification', () => {
  it('counts failure, timeout and software failure as failing', () => {
    expect(isFailingStatus(BuildStatus.FAILED)).toBe(true);
    expect(isFailingStatus(BuildStatus.TIMED_OUT)).toBe(true);
    expect(isFailingStatus(BuildStatus.SOFTWARE_FAILURE)).toBe(true);
  });

  it('does not count successes or cancellations as failing', () => {
    expect(isFailingStatus(BuildStatus.SUCCESS)).toBe(false);
    expect(isFailingStatus(BuildStatus.ALREADY_BUILT)).toBe(false);
    expect(isFailingStatus(BuildStatus.SKIPPED)).toBe(false);
    expect(isFailingStatus(BuildStatus.CANCELED)).toBe(false);
    expect(isFailingStatus(BuildStatus.CANCELED_REQUEUE)).toBe(false);
  });
});

describe('unresolvedFailedBuildFromRow', () => {
  const baseRow: UnresolvedFailureRow = {
    pkgname: 'floorp',
    status: '3',
    timestamp: '2026-08-20T12:00:00.000Z',
    streakStartedAt: '2026-08-18T06:00:00.000Z',
    logUrl: 'https://logs.example/floorp',
    consecutiveFailures: 2,
    silenced: false,
  };

  it('maps a SQL row to the DTO shape', () => {
    expect(unresolvedFailedBuildFromRow(baseRow)).toEqual({
      pkgname: 'floorp',
      status: BuildStatus.FAILED,
      statusText: 'failure',
      timestamp: '2026-08-20T12:00:00.000Z',
      streakStartedAt: '2026-08-18T06:00:00.000Z',
      logUrl: 'https://logs.example/floorp',
      consecutiveFailures: 2,
      silenced: false,
    });
  });

  it('falls back to the latest failure when the streak start is empty', () => {
    const mapped = unresolvedFailedBuildFromRow({ ...baseRow, streakStartedAt: null });
    expect(mapped?.streakStartedAt).toBe('2026-08-20T12:00:00.000Z');
  });

  it('accepts Date objects and normalizes them to ISO strings', () => {
    const row = {
      ...baseRow,
      status: '4',
      timestamp: new Date('2026-08-21T00:00:00.000Z'),
      streakStartedAt: new Date('2026-08-19T00:00:00.000Z'),
    };
    const mapped = unresolvedFailedBuildFromRow(row);
    expect(mapped?.statusText).toBe('timeout');
    expect(mapped?.timestamp).toBe('2026-08-21T00:00:00.000Z');
    expect(mapped?.streakStartedAt).toBe('2026-08-19T00:00:00.000Z');
  });

  it('marks silenced rows as such', () => {
    expect(unresolvedFailedBuildFromRow({ ...baseRow, silenced: true })?.silenced).toBe(true);
  });

  it('drops rows with an unknown status', () => {
    expect(unresolvedFailedBuildFromRow({ ...baseRow, status: '99' })).toBeNull();
  });

  it('drops rows with an unparseable timestamp', () => {
    expect(unresolvedFailedBuildFromRow({ ...baseRow, timestamp: 'not-a-date' })).toBeNull();
  });
});

describe('isValidPkgname', () => {
  it.each(['floorp', 'python-setuptools', 'lib32-mesa', '7zip', 'gtk4', 'app++.x86_64'])('accepts %j', (pkgname) => {
    expect(isValidPkgname(pkgname)).toBe(true);
  });

  it.each(['', 'a/b', 'pkg name', '$pkg', "pkg'; drop", `${'a'.repeat(256)}`])('rejects %j', (pkgname) => {
    expect(isValidPkgname(pkgname)).toBe(false);
  });
});

describe('shouldBuildDecision', () => {
  const HOUR_MS = 60 * 60 * 1000;

  it('allows building without any recent builds', () => {
    expect(shouldBuildDecision([], null)).toEqual({ shouldBuild: true, consecutiveFailures: 0 });
  });

  it('allows building below the failure limit', () => {
    const statuses = Array.from({ length: 4 }, () => BuildStatus.FAILED);
    expect(shouldBuildDecision(statuses, 0)).toEqual({ shouldBuild: true, consecutiveFailures: 4 });
  });

  it('blocks fresh failure loops at the limit', () => {
    const statuses = Array.from({ length: 5 }, () => BuildStatus.FAILED);
    expect(shouldBuildDecision(statuses, 0)).toEqual({ shouldBuild: false, consecutiveFailures: 5 });
    expect(shouldBuildDecision([...statuses, ...statuses], 0)).toEqual({
      shouldBuild: false,
      consecutiveFailures: 10,
    });
  });

  it('unblocks a blocked package once its newest attempt is older than the cooldown', () => {
    const statuses = Array.from({ length: 6 }, () => BuildStatus.FAILED);
    expect(shouldBuildDecision(statuses, 23 * HOUR_MS).shouldBuild).toBe(false);
    expect(shouldBuildDecision(statuses, 24 * HOUR_MS)).toEqual({ shouldBuild: true, consecutiveFailures: 6 });
  });

  it('counts every failure flavor in the streak', () => {
    const statuses = [BuildStatus.TIMED_OUT, BuildStatus.SOFTWARE_FAILURE, BuildStatus.FAILED];
    expect(shouldBuildDecision(statuses, 0).consecutiveFailures).toBe(3);
  });

  it('stops the streak at a resolving build', () => {
    const newestFirst = [BuildStatus.FAILED, BuildStatus.FAILED, BuildStatus.SUCCESS, BuildStatus.FAILED];
    expect(shouldBuildDecision(newestFirst, 0)).toEqual({ shouldBuild: true, consecutiveFailures: 2 });
  });

  it('stops the streak at an unknown status instead of counting it', () => {
    expect(shouldBuildDecision([BuildStatus.FAILED, 99], 0)).toEqual({ shouldBuild: true, consecutiveFailures: 1 });
  });
});

describe('BuilderService silence handling', () => {
  function createService(rows: UnresolvedFailureRow[]): {
    service: BuilderService;
    buildsQb: Record<string, ReturnType<typeof vi.fn>>;
  } {
    const buildsQb: Record<string, ReturnType<typeof vi.fn>> = {};
    const chainable = new Proxy(buildsQb, {
      get(target, prop: string) {
        if (!(prop in target)) target[prop] = vi.fn(() => chainable);
        return target[prop];
      },
    });
    buildsQb.getRawMany = vi.fn().mockResolvedValue(rows);
    const buildRepository = {
      createQueryBuilder: vi.fn(() => chainable),
    } as unknown as Repository<Build>;
    const silencedFailureRepository = {
      createQueryBuilder: vi.fn(() => {
        const qb = {
          insert: vi.fn(() => qb),
          into: vi.fn(() => qb),
          values: vi.fn(() => qb),
          orIgnore: vi.fn(() => qb),
          execute: vi.fn().mockResolvedValue(undefined),
        };
        return qb;
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as Repository<SilencedBuildFailure>;
    const configService = {
      get: vi.fn(),
      getOrThrow: vi.fn((key: string) => (key === 'redis.port' ? 6379 : 'localhost')),
    } as unknown as ConfigService;

    const service = new BuilderService(
      buildRepository,
      {} as Repository<Builder>,
      {} as Repository<Repo>,
      {} as Repository<Package>,
      silencedFailureRepository,
      configService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as EntityLookupService,
      {} as never,
    );
    return { service, buildsQb };
  }

  it('returns the mapped unresolved failures', async () => {
    const row: UnresolvedFailureRow = {
      pkgname: 'firefox-nightly',
      status: '7',
      timestamp: new Date('2026-08-24T10:00:00.000Z'),
      streakStartedAt: new Date('2026-08-20T08:00:00.000Z'),
      logUrl: null,
      consecutiveFailures: 5,
      silenced: false,
    };
    const builds = await createService([row]).service.getUnresolvedFailedBuilds();

    expect(builds).toHaveLength(1);
    expect(builds[0]).toMatchObject({
      pkgname: 'firefox-nightly',
      statusText: 'software-failure',
      streakStartedAt: '2026-08-20T08:00:00.000Z',
      consecutiveFailures: 5,
      silenced: false,
    });
  });

  it('silences via an idempotent insert', async () => {
    const { service } = createService([]);
    await service.silenceUnresolvedFailedBuild('firefox-nightly');

    const repository = (
      service as unknown as { silencedFailureRepository: { createQueryBuilder: ReturnType<typeof vi.fn> } }
    ).silencedFailureRepository;
    const qb = repository.createQueryBuilder.mock.results[0]?.value;
    expect(qb.values).toHaveBeenCalledWith({ pkgname: 'firefox-nightly' });
    expect(qb.orIgnore).toHaveBeenCalled();
    expect(qb.execute).toHaveBeenCalled();
  });

  it('unsilences by deleting the package row', async () => {
    const { service } = createService([]);
    await service.unsilenceUnresolvedFailedBuild('firefox-nightly');

    const repository = (service as unknown as { silencedFailureRepository: { delete: ReturnType<typeof vi.fn> } })
      .silencedFailureRepository;
    expect(repository.delete).toHaveBeenCalledWith({ pkgname: 'firefox-nightly' });
  });

  it('decides should-build from the trailing verdict builds of the pkgbase', async () => {
    const rows = Array.from({ length: 5 }, () => ({ status: '3', timestamp: new Date() }));
    const { service, buildsQb } = createService([]);
    buildsQb.getRawMany.mockResolvedValue(rows);

    const decision = await service.getShouldBuild('firefox-nightly');

    expect(decision).toEqual({ shouldBuild: false, consecutiveFailures: 5 });
    expect(buildsQb.where).toHaveBeenCalledWith('(pkg."pkgbaseName" = :pkgbase OR pkg.pkgname = :pkgbase)', {
      pkgbase: 'firefox-nightly',
    });
    expect(buildsQb.andWhere).toHaveBeenCalledWith('build.status IN (:...verdicts)', {
      verdicts: BUILD_VERDICT_STATUSES,
    });
    expect(buildsQb.cache).toHaveBeenCalledWith('should-build-firefox-nightly', CACHE_TTL_MS);
  });

  it('retries a blocked pkgbase once its newest failure went stale', async () => {
    const staleTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const rows = Array.from({ length: 6 }, () => ({ status: '3', timestamp: staleTimestamp }));
    const { service, buildsQb } = createService([]);
    buildsQb.getRawMany.mockResolvedValue(rows);

    await expect(service.getShouldBuild('firefox-nightly')).resolves.toEqual({
      shouldBuild: true,
      consecutiveFailures: 6,
    });
  });
});
