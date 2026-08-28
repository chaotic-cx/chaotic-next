import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
import { parseCiConfig } from '../repo-manager/bump';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { Package } from './builder.entity';
import { BUILD_CLASS_MAX, BUILD_CLASS_MIN, type BuildClassSuggestion } from '@chaotic-next/shared-lib';
import { Injectable } from '@nestjs/common';
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
 * without a BUILDER_CLASS entry get the default class. Mismatches with the
 * resource-usage-derived class are logged as warnings until automatic
 * adjustment is enabled.
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
    let changed = false;
    for (const member of members) {
      changed = this.alignRowWithConfig(member, effectiveClass, pkgbase) || changed;
    }
    if (changed) {
      await this.packageRepository.save(members);
    }

    const pkgbaseRow = members.find((member) => member.pkgname === pkgbase) ?? members[0];
    await this.warnOnMismatch(pkgbaseRow, effectiveClass);
  }

  private async applyConfigToPackage(pkg: Package): Promise<boolean> {
    const configPathBase = pkg.pkgbaseName ?? pkg.pkgname;
    const configText = await this.gitlabPipelineService.fetchCiConfig(pkg.repo?.name ?? '', configPathBase);
    if (configText === null) return false;

    const effectiveClass = this.effectiveClassOf(configText);
    const changed = this.alignRowWithConfig(pkg, effectiveClass, configPathBase);
    if (changed) {
      await this.packageRepository.save(pkg);
    }

    await this.warnOnMismatch(pkg, effectiveClass);
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

  private async warnOnMismatch(pkg: Package, currentClass: number): Promise<void> {
    let suggestions: BuildClassSuggestion[];
    try {
      suggestions = await this.buildClassSuggester.suggestForPackages([pkg.pkgname]);
    } catch (err: unknown) {
      this.pino.debug({ err, pkgname: pkg.pkgname }, 'Could not derive a build class suggestion');
      return;
    }

    const suggestion = suggestions[0];
    if (!suggestion || suggestion.suggestedBuildClass === null || suggestion.suggestedBuildClass === currentClass) {
      return;
    }

    this.pino.warn(
      {
        pkgname: pkg.pkgname,
        configured: currentClass,
        suggested: suggestion.suggestedBuildClass,
        samples: suggestion.samples,
      },
      'Build class adjustment suggested',
    );
  }
}
