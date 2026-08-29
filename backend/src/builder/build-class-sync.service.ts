import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
import { applyBuilderClass, parseCiConfig } from '../repo-manager/bump';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { Package } from './builder.entity';
import {
  BUILD_CLASS_MAX,
  BUILD_CLASS_MIN,
  type AdjustBuildClassResponse,
  type BuildClassSuggestion,
  snapBuildClassToEven,
} from '@chaotic-next/shared-lib';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type Repository } from 'typeorm';

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
    const repoName = pkg.repo?.name ?? '';
    const configText = await this.gitlabPipelineService.fetchCiConfig(repoName, pkgbase);
    if (configText === null) {
      throw new NotFoundException(`Package not found: ${pkgbase} has no .CI/config`);
    }

    const effectiveClass = this.effectiveClassOf(configText);
    const adjustedClass = await this.autoAdjustBuildClass(repoName, pkgbase, configText, effectiveClass);
    const finalClass = adjustedClass ?? effectiveClass;
    if (this.alignRowWithConfig(pkg, finalClass, pkgbase)) {
      await this.packageRepository.save(pkg);
    }

    return { pkgname: pkg.pkgname, pkgbase, buildClass: finalClass, adjusted: adjustedClass !== null };
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

    const configText = await this.gitlabPipelineService.fetchCiConfig(repoName, pkgbase);
    if (configText === null) return;

    const effectiveClass = this.effectiveClassOf(configText);
    const adjustedClass = await this.autoAdjustBuildClass(repoName, pkgbase, configText, effectiveClass);
    const finalClass = adjustedClass ?? effectiveClass;

    let changed = false;
    for (const member of members) {
      changed = this.alignRowWithConfig(member, finalClass, pkgbase) || changed;
    }
    if (changed) {
      await this.packageRepository.save(members);
    }
  }

  private async applyConfigToPackage(pkg: Package): Promise<boolean> {
    const configPathBase = pkg.pkgbaseName ?? pkg.pkgname;
    const configText = await this.gitlabPipelineService.fetchCiConfig(pkg.repo?.name ?? '', configPathBase);
    if (configText === null) return false;

    const effectiveClass = this.effectiveClassOf(configText);
    const adjustedClass = await this.autoAdjustBuildClass(
      pkg.repo?.name ?? '',
      configPathBase,
      configText,
      effectiveClass,
    );
    const finalClass = adjustedClass ?? effectiveClass;
    const changed = this.alignRowWithConfig(pkg, finalClass, configPathBase);
    if (changed) {
      await this.packageRepository.save(pkg);
    }

    return changed;
  }

  private effectiveClassOf(configText: string): number {
    return parseConfiguredBuildClass(configText) ?? DEFAULT_BUILD_CLASS;
  }

  private alignRowWithConfig(pkg: Package, effectiveClass: number, pkgbasePath: string): boolean {
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

    const configuredClass = parseConfiguredBuildClass(configText);
    if (configuredClass !== null && configuredClass % 2 !== 0) {
      this.pino.debug(
        { pkgbase, configuredClass, suggested: suggestion.suggestedBuildClass },
        'Manual build class left untouched',
      );
      return null;
    }

    const suggestedEven = snapBuildClassToEven(suggestion.suggestedBuildClass);
    if (suggestedEven === currentClass) return null;

    const updatedConfig = applyBuilderClass(configText, suggestedEven);
    const committed = await this.gitlabPipelineService.commitCiConfig(
      repoName,
      pkgbase,
      updatedConfig,
      `chore(build-class): ${pkgbase}\n\nAutomatic adjustment from ${currentClass} to ${suggestedEven}, based on ${suggestion.samples} builds.`,
    );
    if (!committed) {
      this.pino.warn({ pkgbase, currentClass, suggested: suggestedEven }, 'Automatic build class commit failed');
      return null;
    }

    this.pino.info(
      { pkgbase, previous: currentClass, buildClass: suggestedEven, samples: suggestion.samples },
      'Automatically adjusted build class',
    );
    return suggestedEven;
  }
}
