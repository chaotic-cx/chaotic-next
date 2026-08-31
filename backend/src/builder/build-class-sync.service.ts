import {
  type AdjustBuildClassResponse,
  BUILD_CLASS_MAX,
  BUILD_CLASS_MIN,
  type BuildClassSuggestion,
  snapBuildClassToEven,
} from '@chaotic-next/shared-lib';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type Repository } from 'typeorm';
import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
import { applyBuilderClass, parseCiConfig } from '../repo-manager/bump';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { Package } from './builder.entity';

const CI_KEY_BUILDER_CLASS = 'BUILDER_CLASS';
const DEFAULT_BUILD_CLASS = 5;

export function parseConfiguredBuildClass(configText: string): number | null {
  const value = parseCiConfig(configText)[CI_KEY_BUILDER_CLASS];
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < BUILD_CLASS_MIN || parsed > BUILD_CLASS_MAX) return null;
  return parsed;
}

/**
 * Keeps the persisted build class of packages in sync with the .CI/config of
 * their PKGBUILD pkgbase. The pkgbase relation comes from the pacman database
 * (%BASE%), so split package members resolve to their shared config. Packages
 * without a BUILDER_CLASS entry get the default class. When the resource
 * usage suggests a different class, the config is adjusted automatically
 * (even classes only, see snapBuildClassToEven).
 */
@Injectable()
export class BuildClassSyncService {
  constructor(
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    private readonly gitlabPipelineService: GitlabPipelineService,
    private readonly buildClassSuggester: BuildClassSuggesterService,
    @InjectPinoLogger(BuildClassSyncService.name) private readonly pino: PinoLogger,
  ) {}

  async rescanAllPackages(): Promise<void> {
    const packages = await this.packageRepository.find({
      where: { isActive: true },
      relations: { repo: true },
    });
    this.pino.info({ count: packages.length }, 'Full build class rescan started for active packages');

    let synced = 0;
    for (const pkg of packages) {
      const changed = await this.applyConfigToPackage(pkg).catch((err: unknown) => {
        this.pino.warn({ err, pkgname: pkg.pkgname }, 'Build class sync failed');
        return false;
      });
      if (changed) synced += 1;
    }
    this.pino.info({ synced, total: packages.length }, 'Full build class rescan finished');
  }

  async syncFromDeployment(repoName: string, pkgbases: string[]): Promise<void> {
    const uniqueNames = [...new Set(pkgbases.map((name) => name.trim()).filter((name) => name.length > 0))];
    if (uniqueNames.length === 0) return;

    for (const pkgbase of uniqueNames) {
      await this.syncPkgbase(repoName, pkgbase).catch((err: unknown) => {
        this.pino.warn({ err, pkgbase }, 'Build class sync failed');
      });
    }
  }

  async adjustPackageBuildClass(pkgname: string): Promise<AdjustBuildClassResponse> {
    const pkg = await this.packageRepository.findOne({ where: { pkgname }, relations: { repo: true } });
    if (!pkg) {
      throw new NotFoundException(`Package not found: ${pkgname}`);
    }

    const pkgbase = pkg.pkgbaseName ?? pkg.pkgname;
    const outcome = await this.resolveBuildClass(pkg.repo?.name ?? '', pkgbase);
    if (outcome === null) {
      throw new NotFoundException(`Could not read or create .CI/config for ${pkgbase}`);
    }
    if (this.alignRowWithConfig(pkg, outcome.finalClass, pkgbase)) {
      await this.packageRepository.save(pkg);
    }

    return { pkgname: pkg.pkgname, pkgbase, buildClass: outcome.finalClass, adjusted: outcome.adjusted };
  }

  private async syncPkgbase(repoName: string, pkgbase: string): Promise<void> {
    const members = await this.packageRepository.find({
      where: [
        { pkgname: pkgbase, repo: { name: repoName } },
        { pkgbaseName: pkgbase, repo: { name: repoName } },
      ],
      relations: { repo: true },
    });
    if (members.length === 0) {
      this.pino.debug({ pkgbase, repo: repoName }, 'No packages found for deployment');
      return;
    }

    const outcome = await this.resolveBuildClass(repoName, pkgbase);
    if (outcome === null) return;

    let changed = false;
    for (const member of members) {
      changed = this.alignRowWithConfig(member, outcome.finalClass, pkgbase) || changed;
    }
    if (changed) {
      await this.packageRepository.save(members);
    }
  }

  private async applyConfigToPackage(pkg: Package): Promise<boolean> {
    const configPathBase = pkg.pkgbaseName ?? pkg.pkgname;
    const outcome = await this.resolveBuildClass(pkg.repo?.name ?? '', configPathBase);
    if (outcome === null) return false;

    const changed = this.alignRowWithConfig(pkg, outcome.finalClass, configPathBase);
    if (changed) {
      await this.packageRepository.save(pkg);
    }

    return changed;
  }

  /** Reads (or creates) the config, applies an automatic adjustment, and returns the resulting class. */
  private async resolveBuildClass(
    repoName: string,
    pkgbase: string,
  ): Promise<{ finalClass: number; adjusted: boolean } | null> {
    const configText = await this.ensureConfigText(repoName, pkgbase);
    if (configText === null) return null;

    const effectiveClass = this.effectiveClassOf(configText);
    const adjustedClass = await this.autoAdjustBuildClass(repoName, pkgbase, configText, effectiveClass);
    return { finalClass: adjustedClass ?? effectiveClass, adjusted: adjustedClass !== null };
  }

  private effectiveClassOf(configText: string): number {
    return parseConfiguredBuildClass(configText) ?? DEFAULT_BUILD_CLASS;
  }

  /** Returns the even-snapped suggestion, or null when no usable build history exists. */
  private async suggestedEvenClass(pkgbase: string): Promise<number | null> {
    let suggestion: BuildClassSuggestion | undefined;
    try {
      const suggestions = await this.buildClassSuggester.suggestForPackages([pkgbase]);
      suggestion = suggestions[0];
    } catch (err: unknown) {
      this.pino.debug({ err, pkgbase }, 'Could not derive a build class suggestion');
      return null;
    }
    if (suggestion?.suggestedBuildClass === null || suggestion === undefined || suggestion.samples < 1) {
      return null;
    }
    return snapBuildClassToEven(suggestion.suggestedBuildClass);
  }

  /**
   * Fetches the pkgbase's `.CI/config`, creating a minimal one when it does
   * not exist yet so no package is silently excluded from class management.
   */
  private async ensureConfigText(repoName: string, pkgbase: string): Promise<string | null> {
    const existing = await this.gitlabPipelineService.fetchCiConfig(repoName, pkgbase);
    if (existing !== null) return existing;

    const buildClass = (await this.suggestedEvenClass(pkgbase)) ?? DEFAULT_BUILD_CLASS;
    const configText = applyBuilderClass('', buildClass);
    const created = await this.gitlabPipelineService.commitCiConfig(
      repoName,
      pkgbase,
      configText,
      `chore(build-class): create config for ${pkgbase}\n\nCreated automatically so the build class can be managed.`,
      { action: 'create' },
    );
    if (!created) {
      this.pino.warn({ pkgbase, repo: repoName }, 'Creating missing .CI/config failed');
      return null;
    }
    this.pino.info({ pkgbase, repo: repoName, buildClass }, 'Created missing .CI/config');
    return configText;
  }

  private alignRowWithConfig(pkg: Package, effectiveClass: number, pkgbasePath: string): boolean {
    if (pkg.buildClass !== null && typeof pkg.buildClass !== 'number') {
      return pkg.pkgbaseName !== pkgbasePath ? ((pkg.pkgbaseName = pkgbasePath), true) : false;
    }
    const classChanged = pkg.buildClass !== effectiveClass;
    const baseChanged = pkg.pkgbaseName !== pkgbasePath;

    if (classChanged) {
      pkg.buildClass = effectiveClass;
      this.pino.info(
        { pkgname: pkg.pkgname, buildClass: effectiveClass, configSource: `${pkgbasePath}/.CI/config` },
        'Updated stored build class',
      );
    }
    if (baseChanged) {
      pkg.pkgbaseName = pkgbasePath;
    }
    return classChanged || baseChanged;
  }

  /**
   * Odd configured classes are manual and stay untouched. Returns the new
   * class, or null when nothing was adjusted.
   */
  private async autoAdjustBuildClass(
    repoName: string,
    pkgbase: string,
    configText: string,
    currentClass: number,
  ): Promise<number | null> {
    const raw = parseCiConfig(configText)[CI_KEY_BUILDER_CLASS];
    if (raw !== undefined && Number.isNaN(Number.parseInt(raw, 10))) {
      this.pino.debug({ pkgbase, raw }, 'Custom build class left untouched');
      return null;
    }
    const suggestedEven = await this.suggestedEvenClass(pkgbase);
    if (suggestedEven === null) return null;

    const configuredClass = parseConfiguredBuildClass(configText);
    if (configuredClass !== null && configuredClass % 2 !== 0) {
      this.pino.debug({ pkgbase, configuredClass, suggested: suggestedEven }, 'Manual build class left untouched');
      return null;
    }

    if (suggestedEven === currentClass) return null;

    const updatedConfig = applyBuilderClass(configText, suggestedEven);
    const committed = await this.gitlabPipelineService.commitCiConfig(
      repoName,
      pkgbase,
      updatedConfig,
      `chore(build-class): ${pkgbase}\n\nAutomatic adjustment from ${currentClass} to ${suggestedEven}, based on recent build resource usage.`,
    );
    if (!committed) {
      this.pino.warn({ pkgbase, currentClass, suggested: suggestedEven }, 'Automatic build class commit failed');
      return null;
    }

    this.pino.info(
      { pkgbase, previous: currentClass, buildClass: suggestedEven },
      'Automatically adjusted build class',
    );
    return suggestedEven;
  }
}
