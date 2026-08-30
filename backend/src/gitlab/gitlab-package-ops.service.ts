import { Package } from '../builder/builder.entity';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { applyPackageBump } from '../repo-manager/bump/bump-config';
import { MAX_LISTED_PACKAGES } from '../repo-manager/repo-rw/repo-writer';
import { GitlabApiService, gitlabRawFileToString } from './gitlab-api.service';
import { GitlabPipelineService } from './gitlab-pipeline.service';
import { type MrActor } from './interfaces';
import { PipelineTrigger } from './pipeline-trigger.entity';
import { type CommitAction } from '@gitbeaker/core';
import { PKGBUILD_SOURCE_AUR, PipelineOperation, PipelineTriggerResult } from '@chaotic-next/shared-lib';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

@Injectable()
export class GitlabPackageOpsService {
  constructor(
    @InjectPinoLogger(GitlabPackageOpsService.name) private readonly pino: PinoLogger,
    private readonly gitlabApiService: GitlabApiService,
    private readonly gitlabPipelineService: GitlabPipelineService,
    private readonly aurScanService: AurScanService,
    @InjectRepository(PipelineTrigger)
    private readonly pipelineTriggerRepository: Repository<PipelineTrigger>,
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
  ) {}

  async dropPackages(
    packages: string[],
    repoName: string,
    ref: string,
    actor: MrActor,
  ): Promise<PipelineTriggerResult> {
    const commitActions: { action: 'delete'; filePath: string }[] = [];
    const gitlabProjectId = await this.gitlabApiService.getRepoGitlabProjectId(repoName);

    for (const rawPkg of packages) {
      const pkgname = rawPkg.trim();
      if (!pkgname) continue;
      try {
        const treeItems = await this.api.Repositories.allRepositoryTrees(gitlabProjectId, {
          path: pkgname,
          ref,
          recursive: true,
          pagination: 'keyset',
          orderBy: 'name',
          sort: 'asc',
        });

        // Deleting all files inside a directory automatically removes the directory in Git.
        const filesToDelete = treeItems.filter((item: { type: string; path: string }) => item.type === 'blob');
        if (filesToDelete.length > 0) {
          for (const file of filesToDelete) {
            commitActions.push({
              action: 'delete',
              filePath: (file as { path: string }).path,
            });
          }
        } else {
          commitActions.push({
            action: 'delete',
            filePath: `${pkgname}/.CI/config`,
          });
        }
      } catch {
        commitActions.push({
          action: 'delete',
          filePath: `${pkgname}/.CI/config`,
        });
      }
    }

    return this.commitAndRecord({
      gitlabProjectId,
      ref,
      subjectPrefix: 'chore(drop)',
      verb: 'Dropped',
      packageNames: packages,
      commitActions,
      operation: PipelineOperation.DROP_PACKAGES,
      inputs: { packages: packages.join(':') },
      actor,
    });
  }

  async addPackages(
    items: { pkgname: string; source?: string }[],
    repoName: string,
    requestOrigin: string,
    ref: string,
    actor: MrActor,
    requestReason?: string,
    customRequestReason?: string,
  ): Promise<PipelineTriggerResult> {
    const itemNames = items.map((i) => i.pkgname);
    this.pino.debug({ pkgnames: itemNames, ref, userName: actor.userName }, 'Processing package addition');
    const commitActions: { action: 'create' | 'update'; filePath: string; content: string }[] = [];
    const gitlabProjectId = await this.gitlabApiService.getRepoGitlabProjectId(repoName);

    for (const item of items) {
      const pkgname = item.pkgname.trim();
      if (!pkgname) continue;
      const source = item.source ?? PKGBUILD_SOURCE_AUR;
      this.pino.debug({ pkgname, source }, 'Fetching AUR metadata and PKGBUILD');

      const configLines = [`CI_PKGBUILD_SOURCE=${source}`];
      if (requestOrigin && requestOrigin.trim()) {
        configLines.push(`CI_REQUEST_ORIGIN=${requestOrigin.trim()}`);
      }
      if (requestReason && requestReason !== 'unset') {
        configLines.push(`CI_REQUEST_REASON=${requestReason.trim()}`);
      }
      if (customRequestReason && customRequestReason.trim()) {
        configLines.push(`CI_CUSTOM_REQUEST_REASON=${customRequestReason.trim()}`);
      }
      const ciConfigContent = `${configLines.join('\n')}\n`;

      try {
        const pkgbuildScan = await this.aurScanService.startScan(pkgname);
        const pkgbuildText = await this.fetchAurPkgbuildText(pkgbuildScan.packageBase || pkgname);

        commitActions.push({
          action: 'create',
          filePath: `${pkgname}/.CI/config`,
          content: ciConfigContent,
        });

        if (pkgbuildText) {
          this.pino.debug({ pkgname, bytes: pkgbuildText.length }, 'Successfully fetched PKGBUILD');
          commitActions.push({
            action: 'create',
            filePath: `${pkgname}/PKGBUILD`,
            content: pkgbuildText,
          });
        } else {
          this.pino.debug({ pkgname }, 'No PKGBUILD content returned');
        }

        for (const file of pkgbuildScan.sourceFiles ?? []) {
          if (file.name === 'PKGBUILD') continue;
          this.pino.debug({ pkgname, fileName: file.name, bytes: file.content.length }, 'Adding auxiliary source file');
          commitActions.push({
            action: 'create',
            filePath: `${pkgname}/${file.name}`,
            content: file.content,
          });
        }
      } catch (err) {
        this.pino.warn({ err, pkgname }, 'Could not fetch AUR sources');
        commitActions.push({
          action: 'create',
          filePath: `${pkgname}/.CI/config`,
          content: ciConfigContent,
        });
      }
    }

    this.pino.debug({ pkgnames: itemNames, actionCount: commitActions.length }, 'Creating GitLab commit');
    const result = await this.commitAndRecord({
      gitlabProjectId,
      ref,
      subjectPrefix: 'feat(add)',
      verb: 'Added',
      packageNames: itemNames,
      commitActions,
      operation: PipelineOperation.ADD_PACKAGES,
      inputs: { add_packages: itemNames.join(' '), request_origin: requestOrigin },
      actor,
    });
    this.pino.info(
      { pkgnames: itemNames, userName: actor.userName, commitUrl: result.webUrl },
      'Package(s) added successfully',
    );
    return result;
  }

  async bumpPackages(
    packages: string[],
    repoName: string,
    ref: string,
    actor: MrActor,
  ): Promise<PipelineTriggerResult> {
    const commitActions: { action: 'update' | 'create'; filePath: string; content: string }[] = [];
    const gitlabProjectId = await this.gitlabApiService.getRepoGitlabProjectId(repoName);

    for (const pkg of packages) {
      const pkgname = pkg.trim();
      if (!pkgname) continue;
      const configPath = `${pkgname}/.CI/config`;
      let existingConfig = '';

      try {
        const raw = await this.api.RepositoryFiles.showRaw(gitlabProjectId, configPath, ref);
        existingConfig = await gitlabRawFileToString(raw);
      } catch {
        // File may not exist yet
      }

      const dbPkg = await this.packageRepository.findOne({ where: { pkgname } });
      if (!dbPkg) {
        throw new NotFoundException(`Package '${pkgname}' not found`);
      }

      const version = dbPkg.version;
      const pkgrel = dbPkg.pkgrel;

      const updatedConfig = applyPackageBump(existingConfig, version, pkgrel);
      commitActions.push({
        action: existingConfig ? 'update' : 'create',
        filePath: configPath,
        content: updatedConfig,
      });
    }

    return this.commitAndRecord({
      gitlabProjectId,
      ref,
      subjectPrefix: 'chore(bump)',
      verb: 'Bumped',
      packageNames: packages,
      commitActions,
      operation: PipelineOperation.BUMP_PACKAGES,
      inputs: { packages: packages.join(':') },
      actor,
    });
  }

  /** Creates one GitLab commit, records its SHA and the pipeline-trigger audit row. */
  private async commitAndRecord(params: {
    gitlabProjectId: string;
    ref: string;
    subjectPrefix: string;
    verb: string;
    packageNames: string[];
    commitActions: CommitAction[];
    operation: PipelineOperation;
    inputs: Record<string, string>;
    actor: MrActor;
  }): Promise<PipelineTriggerResult> {
    const subject =
      params.packageNames.length > MAX_LISTED_PACKAGES
        ? `${params.subjectPrefix}: packages (${params.packageNames.length})`
        : `${params.subjectPrefix}: ${params.packageNames.join(', ')}`;
    const commitMessage = `${subject}\n\n${params.verb} manually by ${params.actor.userName}`;

    const commit = await this.api.Commits.create(
      params.gitlabProjectId,
      params.ref,
      commitMessage,
      params.commitActions,
    );

    if (commit.id) {
      this.gitlabPipelineService.registerCommitSha(commit.id);
    }
    await this.pipelineTriggerRepository.insert({
      ref: params.ref,
      commitSha: commit.id,
      operation: params.operation,
      inputs: params.inputs,
      pipelineId: null,
      webUrl: commit.web_url ?? '',
      ...params.actor,
    });

    return { pipelineId: 0, webUrl: commit.web_url ?? '', status: 'committed' };
  }

  private async fetchAurPkgbuildText(packageBase: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=${encodeURIComponent(packageBase)}`,
      );
      if (response.ok) return await response.text();
    } catch {
      // Fallback null
    }
    return null;
  }

  private get api() {
    return this.gitlabApiService.api;
  }
}
