import { type RebuildCoverageReport } from '@chaotic-next/shared-lib';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { In, Repository } from 'typeorm';
import { Package, Repo } from '../../builder/builder.entity';
import {
  type BumpType,
  type PackageConfig,
  type RepoSettings,
  type RepoUpdateRunParams,
  TriggerType,
} from '../../interfaces/repo-manager';
import { yieldToEventLoop } from '../../utils/functions';
import { BumpService, isCiFlagEnabled } from '../bump';
import { SignalComputeClient } from '../compute/signal-compute.client';
import { ArchlinuxPackage } from '../repo-manager.entity';
import { type RepoReader } from '../repo-rw';
import { type DetectedTriggerDto, summarizeDetails } from './trigger-detector';

// A `.CI/config` flag is on when its value is "1".
export const CI_FLAG_REBUILD_IGNORE_ABI = 'CI_REBUILD_IGNORE_ABI';

// Read the `.CI/config` files in steps, so that a long repo does not hold the event loop.
const YIELD_EVERY = 10;

export interface DetectedTrigger {
  bumpType: BumpType;
  archPkg: ArchlinuxPackage | Package;
  triggerFrom: TriggerType;
  reason: string;
  details: string[];
}

// The detection runs in the compute worker. This service applies the `.CI/config` flags.
@Injectable()
export class RebuildTriggerService {
  constructor(
    private readonly compute: SignalComputeClient,
    private readonly bumpService: BumpService,
    @InjectRepository(ArchlinuxPackage)
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Package)
    private readonly packagesRepository: Repository<Package>,
    private readonly pino: PinoLogger,
  ) {}

  async checkRebuildTriggers(
    reader: RepoReader,
    pkgbaseDirs: string[],
    repo: Repo,
    changed: ArchlinuxPackage[],
    settings: RepoSettings,
  ): Promise<RepoUpdateRunParams[]> {
    const signalEnabled = settings.signalScanEnabled ?? false;
    const detected = signalEnabled
      ? await this.hydrate(
          await this.compute.run('detectArchTriggers', { repoId: repo.id, changedIds: changed.map((pkg) => pkg.id) }),
        )
      : new Map<string, DetectedTrigger>();

    const needsRebuild: RepoUpdateRunParams[] = [];
    for (const [dirIndex, pkgbaseDir] of pkgbaseDirs.entries()) {
      if (dirIndex % YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }

      const pkgConfig: PackageConfig = await this.bumpService.readPackageConfig(reader, { pkgbaseDir, repo });
      const trigger = detected.get(pkgbaseDir);
      if (!trigger || !acceptsSignalRebuild(pkgConfig)) continue;

      const entry = this.buildRebuildEntry({ ...trigger, pkgConfig, pkgbaseDir, settings });
      if (entry) {
        needsRebuild.push(entry);
      }
    }

    this.pino.info({ count: needsRebuild.length, repo: repo.name }, 'Found packages to rebuild');
    return needsRebuild;
  }

  async deploymentTriggers(deployed: Package[], consumers: Package[]): Promise<Map<number, DetectedTrigger>> {
    return this.hydrate(
      await this.compute.run('deploymentTriggers', {
        deployedIds: deployed.map((pkg) => pkg.id),
        consumerIds: consumers.map((pkg) => pkg.id),
      }),
    );
  }

  countUncoveredMissedBreaks(): Promise<number> {
    return this.compute.run('countUncoveredMissedBreaks', {});
  }

  rebuildCoverage(): Promise<RebuildCoverageReport> {
    return this.compute.run('rebuildCoverage', {});
  }

  /**
   * Build a rebuild entry for a detected trigger, or null in dry-run mode
   * (logged only) or when no triggering package could be blamed. The
   * details are summarized for the log line and commit message, so that
   * symbol-loss breaks don't list hundreds of entries.
   */
  buildRebuildEntry(params: {
    pkgConfig: PackageConfig;
    archPkg?: ArchlinuxPackage | Package;
    bumpType: BumpType;
    reason: string;
    details: string[];
    pkgbaseDir: string;
    settings: RepoSettings;
    triggerFrom: TriggerType;
  }): RepoUpdateRunParams | null {
    const details = summarizeDetails(params.details);
    if (params.settings.abiDryRun) {
      this.pino.info({ pkgbaseDir: params.pkgbaseDir, reason: params.reason, details }, 'Dry-run: would rebuild');
      return null;
    }

    if (!params.archPkg) return null;

    this.pino.debug({ pkgbaseDir: params.pkgbaseDir, reason: params.reason, details }, 'Rebuilding package');

    return {
      archPkg: params.archPkg,
      configs: params.pkgConfig.configs,
      pkg: params.pkgConfig.pkgInDb,
      bumpType: params.bumpType,
      triggerFrom: params.triggerFrom,
      details,
    };
  }

  private async hydrate<K>(detected: Map<K, DetectedTriggerDto>): Promise<Map<K, DetectedTrigger>> {
    const triggers = [...detected.values()];
    const idsOf = (from: TriggerType): number[] =>
      triggers.filter((trigger) => trigger.triggerFrom === from).map((trigger) => trigger.ownerId);
    const archIds = idsOf(TriggerType.ARCH);
    const chaoticIds = idsOf(TriggerType.CHAOTIC);

    const [archOwners, chaoticOwners] = await Promise.all([
      archIds.length ? this.archlinuxPackageRepository.find({ where: { id: In(archIds) } }) : [],
      chaoticIds.length ? this.packagesRepository.find({ where: { id: In(chaoticIds) } }) : [],
    ]);
    const archById = new Map(archOwners.map((pkg) => [pkg.id, pkg]));
    const chaoticById = new Map(chaoticOwners.map((pkg) => [pkg.id, pkg]));

    const hydrated = new Map<K, DetectedTrigger>();
    for (const [key, trigger] of detected) {
      const owners: Map<number, ArchlinuxPackage | Package> =
        trigger.triggerFrom === TriggerType.ARCH ? archById : chaoticById;
      const archPkg = owners.get(trigger.ownerId);
      if (!archPkg) continue;

      hydrated.set(key, {
        bumpType: trigger.bumpType,
        archPkg,
        triggerFrom: trigger.triggerFrom,
        reason: trigger.reason,
        details: trigger.details,
      });
    }

    return hydrated;
  }
}

export function acceptsSignalRebuild(pkgConfig: PackageConfig): boolean {
  return !pkgConfig.pkgInDb.skipSignalScan && !isCiFlagEnabled(pkgConfig.configs, CI_FLAG_REBUILD_IGNORE_ABI);
}
