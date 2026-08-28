import 'reflect-metadata';
import { AppModule } from '@chaotic-next/backend/app.module';
import {
  BuilderDatabaseService,
  type BuilderDatabaseServiceOptions,
  PENDING_DEPLOYMENT_TIMEOUT_MS,
} from '@chaotic-next/backend/builder/builder-database.service';
import { Build, Builder, Package, Repo, SilencedBuildFailure } from '@chaotic-next/backend/builder/builder.entity';
import type { BuildStatus, DatabasePackageAddedEvent, MoleculerBuildObject } from '@chaotic-next/backend/types/types';
import type { BuildResourceStats, ChaoticEvent } from '@chaotic-next/shared-lib';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type Context, ServiceBroker } from 'moleculer';
import { Subject, type Subscriber } from 'rxjs';
import { DataSource } from 'typeorm';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateTables } from '../test/e2e-app';

function buildEventPayload(overrides: Partial<MoleculerBuildObject>): MoleculerBuildObject {
  return {
    arch: 'x86_64',
    build_class: '5',
    builder_name: 'immortalis-1',
    commit: '4a70b438f76d5c8f6f739ea110f8c071efe8067f',
    duration: 1.5,
    logUrl: 'https://builds.garudalinux.org/logs/firedragon.html',
    pkgname: 'firedragon',
    replaced: false,
    status: 0,
    target_repo: 'garuda',
    timestamp: Date.now(),
    ...overrides,
  };
}

function buildResourceStats(overrides: Partial<BuildResourceStats> = {}): BuildResourceStats {
  return {
    avg_memory_bytes: 4_000_000_000,
    cpu_time_ns: 3_600_000_000_000,
    disk_read_bytes: 1_000_000_000,
    disk_write_bytes: 5_000_000_000,
    duration_ms: 600_000,
    network_rx_bytes: 100_000_000,
    network_tx_bytes: 300_000_000,
    peak_memory_bytes: 6_000_000_000,
    peak_pids: 400,
    sample_count: 60,
    ...overrides,
  };
}

function packageAddedPayload(overrides: Partial<DatabasePackageAddedEvent>): DatabasePackageAddedEvent {
  return {
    arch: 'x86_64',
    commit: '4a70b438f76d5c8f6f739ea110f8c071efe8067f',
    logUrl: 'https://builds.garudalinux.org/logs/firedragon.html',
    node: 'immortalis-1',
    pkgbase: 'firedragon',
    packages: ['firedragon'],
    source_repo: 'chaotic-aur',
    source_repo_url: 'https://gitlab.com/chaotic-aur/pkgbuilds',
    target_repo: 'garuda',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeCtx<T>(eventName: string, params: T): Context<T> {
  return { eventName, params } as Context<T>;
}

describe('Builder broker event processing (e2e, real PostgreSQL)', () => {
  let dataSource: DataSource;
  let app: NestFastifyApplication;
  let broker: ServiceBroker;
  let service: BuilderDatabaseService;
  let sseSubject: Subject<Partial<MessageEvent<ChaoticEvent>>>;
  let sseEvents: Partial<MessageEvent<ChaoticEvent>>[];
  let sseSubscriber: Subscriber<Partial<MessageEvent<ChaoticEvent>>>;
  let repoManagerStub: {
    eventuallyBumpAffected: ReturnType<typeof vi.fn>;
    updateChaoticVersions: ReturnType<typeof vi.fn>;
  };
  let buildClassSyncStub: {
    syncFromDeployment: ReturnType<typeof vi.fn<(repoName: string, pkgnames: string[]) => Promise<void>>>;
  };
  let gitlabStub: { handleExternalStatus: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    dataSource = app.get<DataSource>(DataSource);

    broker = new ServiceBroker({
      logger: false,
      skipProcessEventRegistration: true,
    });
    await broker.start();

    sseSubject = new Subject();
    sseSubscriber = sseSubject.subscribe((e) => sseEvents.push(e)) as Subscriber<Partial<MessageEvent<ChaoticEvent>>>;
  });

  afterAll(async () => {
    sseSubscriber?.unsubscribe();
    await broker?.stop();
    await app.close();
  });

  beforeEach(async () => {
    await truncateTables(dataSource);

    sseEvents = [];

    repoManagerStub = {
      eventuallyBumpAffected: vi.fn().mockResolvedValue(undefined),
      updateChaoticVersions: vi.fn().mockResolvedValue(undefined),
    };
    buildClassSyncStub = {
      syncFromDeployment: vi.fn<(repoName: string, pkgnames: string[]) => Promise<void>>().mockResolvedValue(undefined),
    };
    gitlabStub = {
      handleExternalStatus: vi.fn().mockResolvedValue(undefined),
    };

    const options: BuilderDatabaseServiceOptions = {
      broker,
      dbConnections: {
        build: dataSource.getRepository(Build),
        builder: dataSource.getRepository(Builder),
        package: dataSource.getRepository(Package),
        repo: dataSource.getRepository(Repo),
        silencedFailure: dataSource.getRepository(SilencedBuildFailure),
      },
      repoManagerService: repoManagerStub as never,
      sseSubject,
      gitlabPipelineService: gitlabStub as never,
      buildClassSync: buildClassSyncStub,
    };

    service = new BuilderDatabaseService(options);
  });

  describe('builds.* event → logBuild', () => {
    it('persists a successful build and emits an SSE event', async () => {
      const payload = buildEventPayload({ status: 0 as BuildStatus, pkgname: 'firedragon', target_repo: 'garuda' });

      await service.logBuild(makeCtx('builds.success', payload));

      const builds = await dataSource.query(
        `SELECT b.id, b.status, b.arch, b.commit, b."timeToEnd", p.pkgname, bd.name as builder_name, r.name as repo_name
         FROM build b
         JOIN package p ON b."pkgbaseId" = p.id
         JOIN builder bd ON b."builderId" = bd.id
         JOIN repo r ON b."repoId" = r.id`,
      );
      expect(builds).toHaveLength(1);
      expect(builds[0].pkgname).toBe('firedragon');
      expect(builds[0].builder_name).toBe('immortalis-1');
      expect(builds[0].repo_name).toBe('garuda');
      expect(builds[0].status).toBe('0');

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].data).toMatchObject({ type: 'build', package: 'firedragon', repo: 'garuda', status: 0 });
    });

    it('auto-creates builder, repo, and package rows on first event', async () => {
      const payload = buildEventPayload({
        builder_name: 'dragon-builder',
        target_repo: 'chaotic-aur',
        pkgname: 'google-chrome',
      });

      await service.logBuild(makeCtx('builds.success', payload));

      const builders = await dataSource.query(`SELECT COUNT(*)::int as c FROM builder WHERE name = 'dragon-builder'`);
      expect(builders[0].c).toBe(1);

      const repos = await dataSource.query(`SELECT COUNT(*)::int as c FROM repo WHERE name = 'chaotic-aur'`);
      expect(repos[0].c).toBe(1);

      const pkgs = await dataSource.query(`SELECT COUNT(*)::int as c FROM package WHERE pkgname = 'google-chrome'`);
      expect(pkgs[0].c).toBe(1);
    });

    it('reuses existing builder, repo, and package on subsequent events', async () => {
      const payload = buildEventPayload({ builder_name: 'stormwing-1', target_repo: 'garuda', pkgname: 'firedragon' });

      await service.logBuild(makeCtx('builds.success', payload));
      await service.logBuild(makeCtx('builds.failed', { ...payload, status: 3 as BuildStatus }));

      const builders = await dataSource.query(`SELECT COUNT(*)::int as c FROM builder WHERE name = 'stormwing-1'`);
      expect(builders[0].c).toBe(1);

      const repos = await dataSource.query(`SELECT COUNT(*)::int as c FROM repo WHERE name = 'garuda'`);
      expect(repos[0].c).toBe(1);

      const pkgs = await dataSource.query(`SELECT COUNT(*)::int as c FROM package WHERE pkgname = 'firedragon'`);
      expect(pkgs[0].c).toBe(1);

      const builds = await dataSource.query(`SELECT COUNT(*)::int as c FROM build`);
      expect(builds[0].c).toBe(2);
    });

    it('creates separate package rows when the same pkgname exists in different repos', async () => {
      await service.logBuild(
        makeCtx('builds.success', buildEventPayload({ pkgname: 'firedragon', target_repo: 'garuda' })),
      );
      await service.logBuild(
        makeCtx('builds.success', buildEventPayload({ pkgname: 'firedragon', target_repo: 'chaotic-aur' })),
      );

      const pkgs = await dataSource.query(`SELECT COUNT(*)::int as c FROM package p WHERE p.pkgname = 'firedragon'`);
      expect(pkgs[0].c).toBe(2);
    });

    it('does not run repo-manager work on successful builds alone', async () => {
      await service.logBuild(makeCtx('builds.failed', buildEventPayload({ status: 3 as BuildStatus })));
      await service.logBuild(
        makeCtx('builds.success', buildEventPayload({ status: 0 as BuildStatus, pkgname: 'paru' })),
      );

      expect(repoManagerStub.eventuallyBumpAffected).not.toHaveBeenCalled();
      expect(repoManagerStub.updateChaoticVersions).not.toHaveBeenCalled();
    });

    it('emits SSE for non-SUCCESS statuses too', async () => {
      await service.logBuild(makeCtx('builds.failed', buildEventPayload({ status: 3 as BuildStatus, pkgname: 'yay' })));

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].data).toMatchObject({ type: 'build', package: 'yay', status: 3 });
    });

    it('clears a failure silence when the package fails again', async () => {
      await dataSource.query(`INSERT INTO silenced_build_failure (pkgname, "silencedAt") VALUES ('firedragon', now())`);

      await service.logBuild(makeCtx('builds.failed', buildEventPayload({ status: 3 as BuildStatus })));

      const silences = await dataSource.query(`SELECT COUNT(*)::int AS c FROM silenced_build_failure`);
      expect(silences[0].c).toBe(0);
    });

    it('keeps the silence while the package does not fail', async () => {
      await dataSource.query(`INSERT INTO silenced_build_failure (pkgname, "silencedAt") VALUES ('firedragon', now())`);

      await service.logBuild(makeCtx('builds.success', buildEventPayload({ status: 0 as BuildStatus })));

      const silences = await dataSource.query(`SELECT COUNT(*)::int AS c FROM silenced_build_failure`);
      expect(silences[0].c).toBe(1);
    });

    it('drops Histogram events', async () => {
      await service.logBuild(makeCtx('builds.successHistogram', buildEventPayload({})));

      const builds = await dataSource.query(`SELECT COUNT(*)::int as c FROM build`);
      expect(builds[0].c).toBe(0);
    });

    it('drops events with missing required fields', async () => {
      await service.logBuild(makeCtx('builds.success', buildEventPayload({ builder_name: '' })));
      await service.logBuild(makeCtx('builds.success', buildEventPayload({ target_repo: '' })));
      await service.logBuild(makeCtx('builds.success', buildEventPayload({ pkgname: '' })));

      const builds = await dataSource.query(`SELECT COUNT(*)::int as c FROM build`);
      expect(builds[0].c).toBe(0);
    });

    it('stores only the pre-colon part of commit', async () => {
      await service.logBuild(
        makeCtx('builds.success', buildEventPayload({ commit: 'abc123def:src/pkgname', pkgname: 'gitkraken' })),
      );

      const [row] = await dataSource.query(
        `SELECT commit FROM build b JOIN package p ON b."pkgbaseId" = p.id WHERE p.pkgname = 'gitkraken'`,
      );
      expect(row.commit).toBe('abc123def');
    });

    it('nulls buildClass when falsy, stringifies when truthy', async () => {
      await service.logBuild(makeCtx('builds.success', buildEventPayload({ build_class: 0, pkgname: 'paru' })));
      await service.logBuild(makeCtx('builds.success', buildEventPayload({ build_class: 7, pkgname: 'yay' })));

      const rows = await dataSource.query(
        `SELECT b."buildClass", p.pkgname FROM build b JOIN package p ON b."pkgbaseId" = p.id ORDER BY p.pkgname`,
      );
      const paruRow = rows.find((r: { pkgname: string }) => r.pkgname === 'paru');
      const yayRow = rows.find((r: { pkgname: string }) => r.pkgname === 'yay');
      expect(paruRow.buildClass).toBeNull();
      expect(yayRow.buildClass).toBe('7');
    });

    it('persists broadcast resource stats onto the build row', async () => {
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({
            pkgname: 'linux-tkg',
            resourceStats: {
              avg_memory_bytes: 4_000_000_000,
              cpu_time_ns: 3_600_000_000_000,
              disk_read_bytes: 1_000_000_000,
              disk_write_bytes: 5_000_000_000,
              duration_ms: 600_000,
              network_rx_bytes: 100_000_000,
              network_tx_bytes: 300_000_000,
              peak_memory_bytes: 6_000_000_000,
              peak_pids: 400,
              sample_count: 60,
            },
          }),
        ),
      );

      const [row] = await dataSource.query(
        `SELECT "resourceStatsAvgMemoryBytes" AS avg_memory, "resourceStatsPeakMemoryBytes" AS peak_memory,
                "resourceStatsCpuTimeNs" AS cpu_time, "resourceStatsSampleCount" AS sample_count,
                "resourceStatsDurationMs" AS duration_ms, "resourceStatsPeakPids" AS peak_pids
         FROM build`,
      );
      expect(row.avg_memory).toBe('4000000000');
      expect(row.peak_memory).toBe('6000000000');
      expect(row.cpu_time).toBe('3600000000000');
      expect(row.sample_count).toBe(60);
      expect(row.duration_ms).toBe(600000);
      expect(row.peak_pids).toBe(400);
    });

    it('leaves resource stats empty when the event carries none', async () => {
      await service.logBuild(makeCtx('builds.success', buildEventPayload({ pkgname: 'nano' })));

      const [row] = await dataSource.query(`SELECT "resourceStatsSampleCount" AS sample_count FROM build`);
      expect(row.sample_count).toBeNull();
    });

    it('discards resource stats without a usable sample count', async () => {
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ pkgname: 'nano', resourceStats: buildResourceStats({ sample_count: Number.NaN }) }),
        ),
      );

      const [row] = await dataSource.query(`SELECT "resourceStatsSampleCount" AS sample_count FROM build`);
      expect(row.sample_count).toBeNull();
    });
  });

  describe('database.packageAdded event → runDeferredDeploymentChecks', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('runs the deferred bump and version work once the deployment is announced', async () => {
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'paru', target_repo: 'garuda' }),
        ),
      );

      await service.runDeferredDeploymentChecks(packageAddedPayload({ pkgbase: 'paru', target_repo: 'garuda' }));

      expect(repoManagerStub.eventuallyBumpAffected).toHaveBeenCalledTimes(1);
      expect(repoManagerStub.updateChaoticVersions).toHaveBeenCalledTimes(1);
    });

    it('matches pending builds via the deployed package list', async () => {
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'google-chrome', target_repo: 'chaotic-aur' }),
        ),
      );

      await service.runDeferredDeploymentChecks(
        packageAddedPayload({
          pkgbase: 'google-chrome',
          packages: ['google-chrome', 'google-chrome-beta'],
          source_repo: 'aur',
          target_repo: 'chaotic-aur',
        }),
      );

      expect(repoManagerStub.eventuallyBumpAffected).toHaveBeenCalledTimes(1);
    });

    it('leaves pending builds untouched for unrelated deployments', async () => {
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'paru', target_repo: 'garuda' }),
        ),
      );

      await service.runDeferredDeploymentChecks(packageAddedPayload({ pkgbase: 'paru', target_repo: 'chaotic-aur' }));

      expect(repoManagerStub.eventuallyBumpAffected).not.toHaveBeenCalled();

      await service.runDeferredDeploymentChecks(packageAddedPayload({ pkgbase: 'paru', target_repo: 'garuda' }));
      expect(repoManagerStub.eventuallyBumpAffected).toHaveBeenCalledTimes(1);
    });

    it('refreshes versions even without a pending build, without bumping', async () => {
      await service.runDeferredDeploymentChecks(packageAddedPayload({}));

      expect(repoManagerStub.updateChaoticVersions).toHaveBeenCalledTimes(1);
      expect(repoManagerStub.eventuallyBumpAffected).not.toHaveBeenCalled();
      expect(buildClassSyncStub.syncFromDeployment).not.toHaveBeenCalled();
    });

    it('triggers a build class sync for the deployed pkgbases', async () => {
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'paru', target_repo: 'garuda' }),
        ),
      );

      await service.runDeferredDeploymentChecks(
        packageAddedPayload({ pkgbase: 'paru', packages: ['paru'], target_repo: 'garuda' }),
      );

      expect(buildClassSyncStub.syncFromDeployment).toHaveBeenCalledTimes(1);
      expect(buildClassSyncStub.syncFromDeployment).toHaveBeenCalledWith('garuda', ['paru']);
    });

    it('drops pending builds once the announcement timeout expires', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'paru', target_repo: 'garuda' }),
        ),
      );

      vi.setSystemTime(Date.now() + PENDING_DEPLOYMENT_TIMEOUT_MS + 1);
      await service.runDeferredDeploymentChecks(packageAddedPayload({ pkgbase: 'paru', target_repo: 'garuda' }));

      expect(repoManagerStub.eventuallyBumpAffected).not.toHaveBeenCalled();

      vi.setSystemTime(Date.now());
      await service.runDeferredDeploymentChecks(packageAddedPayload({ pkgbase: 'paru', target_repo: 'garuda' }));
      expect(repoManagerStub.eventuallyBumpAffected).not.toHaveBeenCalled();
    });

    it('runs bump checks one after another for overlapping announcements', async () => {
      const releaseCheck: (() => void)[] = [];
      repoManagerStub.eventuallyBumpAffected.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releaseCheck.push(resolve);
          }),
      );

      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'paru', target_repo: 'garuda' }),
        ),
      );
      await service.logBuild(
        makeCtx(
          'builds.success',
          buildEventPayload({ status: 0 as BuildStatus, pkgname: 'yay', target_repo: 'garuda' }),
        ),
      );

      await service.runDeferredDeploymentChecks(
        packageAddedPayload({ pkgbase: 'paru', packages: ['paru'], target_repo: 'garuda' }),
      );
      await service.runDeferredDeploymentChecks(
        packageAddedPayload({ pkgbase: 'yay', packages: ['yay'], target_repo: 'garuda' }),
      );

      await vi.waitFor(() => expect(repoManagerStub.eventuallyBumpAffected).toHaveBeenCalledTimes(1));
      releaseCheck[0]();
      await vi.waitFor(() => expect(repoManagerStub.eventuallyBumpAffected).toHaveBeenCalledTimes(2));

      expect(repoManagerStub.eventuallyBumpAffected).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ arch: 'x86_64' }),
      );
      releaseCheck[1]();
    });
  });

  describe('database.removalCompleted event → removeEntries', () => {
    it('deactivates packages by pkgname', async () => {
      const pkgRepo = dataSource.getRepository(Package);
      await pkgRepo.save({
        pkgname: 'firedragon',
        version: '2:13.1.1',
        isActive: true,
        lastUpdated: new Date().toISOString(),
      });
      await pkgRepo.save({
        pkgname: 'google-chrome',
        version: '151.0.7922.71',
        isActive: true,
        lastUpdated: new Date().toISOString(),
      });

      await service.removeEntries(makeCtx('database.removalCompleted', ['firedragon']));

      const [firedragon] = await dataSource.query(`SELECT "isActive" FROM package WHERE pkgname = 'firedragon'`);
      expect(firedragon.isActive).toBe(false);

      const [chrome] = await dataSource.query(`SELECT "isActive" FROM package WHERE pkgname = 'google-chrome'`);
      expect(chrome.isActive).toBe(true);
    });
  });

  describe('metrics.currentQueue event → SSE', () => {
    it('emits a queue SSE event with the payload', async () => {
      const queuePayload = {
        count: 3,
        labels: {
          build_class: ['5', '9'],
          pkgname: ['firedragon', 'google-chrome', 'spotify'],
          target_repo: ['garuda', 'chaotic-aur'],
        },
      };

      const exposedEvents = (
        service as unknown as {
          events: Record<string, (params: unknown) => Promise<void>>;
        }
      ).events;
      await exposedEvents['metrics.currentQueue'](queuePayload);

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0].data).toMatchObject({ type: 'queue', count: 3 });
    });
  });
});
