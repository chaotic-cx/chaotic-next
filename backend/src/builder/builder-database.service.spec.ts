import { type Context, ServiceBroker } from 'moleculer';
import { type PinoLogger } from 'nestjs-pino';
import { Subject } from 'rxjs';
import type { ChaoticEvent } from '@chaotic-next/shared-lib';
import { BuildStatus, type MoleculerBuildObject } from '../types/types';
import { Builder, Repo, type Build, type Package } from './builder.entity';
import { BuilderDatabaseService, type BuilderDatabaseServiceOptions } from './builder-database.service';
import { describe, expect, it, vi } from 'vitest';

const pinoStub = { info: () => undefined, debug: () => undefined, error: () => undefined } as unknown as PinoLogger;

const brokerStub = new ServiceBroker({ logger: false, skipProcessEventRegistration: true });

const builderRow = { id: 1, name: 'immortalis-1', isActive: false } as unknown as Builder;
const repoRow = { id: 1, name: 'chaotic-aur' } as unknown as Repo;
const pkgRow = { id: 1, pkgname: 'paru', pkgbaseName: 'paru', repo: repoRow } as unknown as Package;

const lookupStub = {
  getOrCreateBuilder: () => Promise.resolve(builderRow),
  getOrCreateRepo: () => Promise.resolve(repoRow),
  getOrCreatePackage: () => Promise.resolve(pkgRow),
};

const OUTCOME_BY_EVENT: Record<string, BuildStatus> = {
  'builds.success': BuildStatus.SUCCESS,
  'builds.failed': BuildStatus.FAILED,
  'builds.alreadyBuilt': BuildStatus.ALREADY_BUILT,
  'builds.skipped': BuildStatus.SKIPPED,
  'builds.timeout': BuildStatus.TIMED_OUT,
  'builds.replaced': BuildStatus.CANCELED,
  'builds.canceled': BuildStatus.CANCELED,
  'builds.canceled-requeue': BuildStatus.CANCELED_REQUEUE,
  'builds.softwareFailure': BuildStatus.SOFTWARE_FAILURE,
};

function buildPayload(status: BuildStatus): MoleculerBuildObject {
  return {
    arch: 'x86_64',
    build_class: '5',
    builder_name: 'immortalis-1',
    duration: 1.5,
    logUrl: 'https://builds.garudalinux.org/logs/paru.html',
    pkgname: 'paru',
    replaced: false,
    status,
    target_repo: 'chaotic-aur',
    timestamp: Date.now(),
  };
}

function makeCtx<T>(eventName: string, params: T): Context<T> {
  return { eventName, params } as Context<T>;
}

interface BuildRepositoryStub {
  save: (build: Partial<Build>) => Promise<Partial<Build>>;
}

function createService(buildRepo: BuildRepositoryStub): BuilderDatabaseService {
  const options: BuilderDatabaseServiceOptions = {
    broker: brokerStub,
    dbConnections: {
      build: buildRepo as never,
      builder: {} as never,
      package: {} as never,
      repo: {} as never,
      silencedFailure: { delete: () => Promise.resolve({ affected: 0 }) } as never,
    },
    lookup: lookupStub as never,
    repoManagerService: {} as never,
    sseSubject: new Subject<Partial<MessageEvent<ChaoticEvent>>>(),
    gitlabPipelineService: {} as never,
    buildClassSync: { syncFromDeployment: () => Promise.resolve() },
    logger: pinoStub,
  };
  return new BuilderDatabaseService(options);
}

describe('BuilderDatabaseService.logBuild', () => {
  it('persists every build outcome event the manager broadcasts, with the matching status enum', async () => {
    const saved: Partial<Build>[] = [];
    const service = createService({
      save: (build: Partial<Build>) => {
        saved.push(build);
        return Promise.resolve(build);
      },
    });

    for (const [eventName, status] of Object.entries(OUTCOME_BY_EVENT)) {
      await service.logBuild(makeCtx(eventName, buildPayload(status)));
    }

    const persisted = saved.map((build) => build.status);
    for (const status of Object.values(OUTCOME_BY_EVENT)) {
      expect(persisted).toContain(status);
    }
    expect(saved).toHaveLength(Object.keys(OUTCOME_BY_EVENT).length);
  });

  it('drops events that are not build outcomes', async () => {
    const save = vi.fn<BuildRepositoryStub['save']>().mockResolvedValue({ status: BuildStatus.SUCCESS });
    const service = createService({ save });

    await service.logBuild(
      makeCtx('builds.addToBuildTimerHistogram', { ...buildPayload(BuildStatus.SUCCESS), duration: 1.5 }),
    );

    expect(save).not.toHaveBeenCalled();
  });
});
