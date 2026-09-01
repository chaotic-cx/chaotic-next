import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Container } from 'dockerode';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs';
import * as path from 'node:path';
import { Subject } from 'rxjs';
import { In, type ObjectLiteral, Repository } from 'typeorm';
import type { PortableBuilderConfig } from '../config/portable-builder.config';
import { ArtifactScanService } from './artifact-scan.service';
import { ContainerActivityWatchdog } from './container-activity-watchdog';
import { ContainerStatsCollector, type ContainerUsage, formatContainerUsage } from './container-usage';
import { DockerService } from './docker.service';
import {
  PORTABLE_BUILD_ACTIVE_STATUSES,
  type PortableArtifactScan,
  PortableBuild,
  type PortableBuildStatus,
} from './portable-build.entity';

const PKGBASE_PATTERN = /^[a-z0-9][a-z0-9._@+-]*$/;
const AUR_URL = 'https://aur.archlinux.org';
const CONTAINER_LABEL = 'chaotic-next.portable-build';
const LOG_HEAD_BYTES = 512 * 1024;
const LOG_TAIL_BYTES = 512 * 1024;
const ARTIFACT_SUFFIX = '.zst';
const BUILDER_HOSTNAME = 'chaotic-next-portable-builder';

export class CappedLogBuffer {
  private head = '';
  private headFull = false;
  private tail: string[] = [];
  private tailSize = 0;

  constructor(
    private readonly headBytes: number,
    private readonly tailBytes: number,
  ) {}

  append(chunk: string): void {
    if (!this.headFull) {
      this.head += chunk;
      if (Buffer.byteLength(this.head) >= this.headBytes) this.headFull = true;
      return;
    }
    this.tail.push(chunk);
    this.tailSize += Buffer.byteLength(chunk);
    while (this.tailSize > this.tailBytes && this.tail.length > 1) {
      const oldest = this.tail[0];
      if (oldest === undefined) break;
      this.tailSize -= Buffer.byteLength(oldest);
      this.tail.shift();
    }
  }

  toString(): string {
    if (!this.headFull) return this.head + this.tail.join('');
    return `${this.head}\n... log truncated ...\n${this.tail.join('')}`;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Queues and runs test builds of AUR pkgbases inside the chaotic-manager builder container,
 * replicating chaotic-portable-builder. Unlike upstream CPB, no local repo database is created
 * and no packages are signed: artifacts are kept on disk for scanning instead. Builds are
 * resource-limited and watched for idleness with the upstream watchdog algorithm.
 */
@Injectable()
export class PortableBuilderService implements OnModuleInit, OnModuleDestroy {
  private readonly config: PortableBuilderConfig;
  private readonly jobFinished = new Subject<PortableBuild>();
  private drainPromise: Promise<void> | null = null;
  private watchdog: ContainerActivityWatchdog | null = null;
  private idleTerminated = false;
  private destroyed = false;

  constructor(
    configService: ConfigService,
    @InjectRepository(PortableBuild) private readonly builds: Repository<PortableBuild>,
    private readonly docker: DockerService,
    private readonly artifactScan: ArtifactScanService,
    @InjectPinoLogger(PortableBuilderService.name) private readonly pino: PinoLogger,
  ) {
    this.config = configService.getOrThrow<PortableBuilderConfig>('portable-builder');
  }

  readonly jobFinished$ = this.jobFinished.asObservable();

  async onModuleInit(): Promise<void> {
    const leftovers = await this.docker.sweepLabeled(CONTAINER_LABEL).catch((err: unknown) => {
      this.pino.warn({ err }, 'Leftover container sweep failed');
      return 0;
    });
    if (leftovers > 0) this.pino.warn({ count: leftovers }, 'Removed leftover build containers');
    await this.builds.update(
      { status: In(PORTABLE_BUILD_ACTIVE_STATUSES.filter((status) => status !== 'queued')) },
      { status: 'failed', error: 'Interrupted by backend restart', finishedAt: new Date() },
    );
    void this.drain();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
  }

  async enqueue(pkgbase: string, issueNumber: number | null = null): Promise<PortableBuild> {
    const normalized = pkgbase.trim().toLowerCase();
    if (!PKGBASE_PATTERN.test(normalized)) {
      throw new BadRequestException(`'${pkgbase}' is not a valid AUR pkgbase`);
    }
    const active = await this.builds.exists({
      where: { pkgbase: normalized, status: In(PORTABLE_BUILD_ACTIVE_STATUSES) },
    });
    if (active) throw new ConflictException(`A build of '${normalized}' is already queued or running`);

    const build = await this.builds.save(this.builds.create({ pkgbase: normalized, status: 'queued', issueNumber }));
    this.pino.info({ buildId: build.id, pkgbase: normalized, issueNumber }, 'Queued portable build');
    void this.drain();
    return build;
  }

  /** Runs queued builds one at a time; concurrent callers share the same drain run. */
  async drain(): Promise<void> {
    this.drainPromise ??= this.drainLoop().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  private async drainLoop(): Promise<void> {
    for (;;) {
      if (this.destroyed) return;
      let next: PortableBuild | null;
      try {
        next = await this.builds.findOne({ where: { status: 'queued' }, order: { id: 'ASC' } });
      } catch (err) {
        if (this.destroyed) return;
        throw err;
      }
      if (!next || this.destroyed) return;
      await this.runJob(next);
    }
  }

  async listBuilds(
    page: number,
    perPage: number,
    pkgbase: string | undefined,
    status: PortableBuildStatus | undefined,
  ): Promise<{ builds: PortableBuild[]; total: number }> {
    const where: ObjectLiteral = {};
    if (pkgbase !== undefined) where.pkgbase = pkgbase;
    if (status !== undefined) where.status = status;
    const [builds, total] = await this.builds.findAndCount({
      where,
      order: { id: 'DESC' },
      take: perPage,
      skip: (page - 1) * perPage,
    });
    return { builds, total };
  }

  getBuild(id: number): Promise<PortableBuild | null> {
    return this.builds.findOneBy({ id });
  }

  async getLogPath(id: number): Promise<string | null> {
    const build = await this.getBuild(id);
    if (!build) return null;
    return this.existingFile(path.join(this.config.workDir, 'logs', `${id}.log`));
  }

  async getArtifactPath(id: number, name: string): Promise<string | null> {
    const build = await this.getBuild(id);
    if (!build?.artifacts?.includes(name)) return null;
    return this.existingFile(path.join(this.config.workDir, 'artifacts', String(id), name));
  }

  private async existingFile(filePath: string): Promise<string | null> {
    const stat = await fs.stat(filePath).catch(() => null);
    return stat?.isFile() ? filePath : null;
  }

  linksFor(build: Pick<PortableBuild, 'id' | 'artifacts'>): { logUrl: string; artifactUrls: string[] } {
    const base = `${this.config.publicBaseUrl.replace(/\/+$/, '')}/portable-builder/builds/${build.id}`;
    return {
      logUrl: `${base}/log`,
      artifactUrls: (build.artifacts ?? []).map((name) => `${base}/artifacts/${encodeURIComponent(name)}`),
    };
  }

  private async runJob(build: PortableBuild): Promise<void> {
    const jobDir = path.join(this.config.workDir, 'jobs', String(build.id));
    const pkgbuildsDir = path.join(jobDir, 'pkgbuilds');
    const artifactDir = path.join(this.config.workDir, 'artifacts', String(build.id));
    const startedAt = new Date();
    const collector = new ContainerStatsCollector();
    const logBuffer = new CappedLogBuffer(LOG_HEAD_BYTES, LOG_TAIL_BYTES);
    let logFile: WriteStream | null = null;
    const appendToLog = (chunk: string): void => {
      logBuffer.append(chunk);
      logFile?.write(chunk);
    };
    this.idleTerminated = false;

    try {
      const logPath = path.join(this.config.workDir, 'logs', `${build.id}.log`);
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      logFile = createWriteStream(logPath, { flags: 'w' });
      logFile.on('error', (err: Error) => {
        this.pino.error({ err, buildId: build.id }, 'Build log file write failed');
      });

      await this.builds.update(build.id, { status: 'cloning', startedAt, error: null });
      await fs.mkdir(pkgbuildsDir, { recursive: true });
      await fs.mkdir(artifactDir, { recursive: true });
      // ponytail: the shared pacman cache grows unbounded; prune it externally if disk fills up
      await fs.mkdir(path.join(this.config.workDir, 'pkgcache'), { recursive: true });

      await this.cloneFromAur(build.pkgbase, pkgbuildsDir, appendToLog);
      await this.builds.update(build.id, { status: 'building' });

      const container = await this.createBuildContainer(build.pkgbase, pkgbuildsDir, artifactDir);
      this.startWatchdog(container, build.pkgbase, collector, appendToLog);
      const exitCode = await this.docker.startAndWait(container, appendToLog);
      this.stopWatchdog();
      const resourceStats = collector.getStats(Date.now() - startedAt.getTime());

      if (this.idleTerminated) {
        await this.finish(
          build,
          'timed-out',
          logBuffer,
          resourceStats,
          'No container activity for the configured idle timeout',
        );
      } else if (exitCode !== 0) {
        await this.finish(build, 'failed', logBuffer, resourceStats, `Build exited with code ${exitCode}`);
      } else {
        const artifacts = await this.collectArtifacts(build, artifactDir, logBuffer, resourceStats);
        if (artifacts !== null) {
          const scan = await this.artifactScan.scanArtifacts({
            artifactDir,
            image: this.config.image,
            labels: this.containerLabels(),
            buildId: build.id,
          });
          await this.finish(build, 'success', logBuffer, resourceStats, null, artifacts, scan);
        }
      }
    } catch (err) {
      this.stopWatchdog();
      this.pino.error({ err, buildId: build.id }, 'Portable build failed');
      await this.finish(build, 'failed', logBuffer, null, errorMessage(err));
    } finally {
      const file = logFile;
      if (file) await new Promise((resolve) => file.end(resolve));
      await this.cleanupJobDir(jobDir);
      const finalBuild = await this.builds.findOneBy({ id: build.id });
      if (finalBuild) this.jobFinished.next(finalBuild);
    }
  }

  /** Root-owned leftovers from the build container need a container-side removal first. */
  private async cleanupJobDir(jobDir: string): Promise<void> {
    const removed = await fs.rm(jobDir, { recursive: true, force: true }).then(
      () => true,
      () => false,
    );
    if (removed) return;
    await this.docker
      .removeTree(jobDir, this.config.image, this.containerLabels())
      .catch((err: unknown) => this.pino.warn({ err, jobDir }, 'Container-side job directory cleanup failed'));
    await fs.rm(jobDir, { recursive: true, force: true }).catch((err: unknown) => {
      this.pino.warn({ err, jobDir }, 'Host-side job directory cleanup failed');
    });
  }

  private async cloneFromAur(
    pkgbase: string,
    pkgbuildsDir: string,
    appendToLog: (chunk: string) => void,
  ): Promise<void> {
    // The clone runs as root inside the container; handing the tree to the host user afterwards
    // keeps job directory cleanup on the host possible.
    const hostUid = process.getuid?.() ?? 0;
    const container = await this.docker.createBuildContainer({
      image: this.config.image,
      cmd: [
        '-c',
        `git clone --depth=1 ${AUR_URL}/${pkgbase}.git /pkgbuilds/${pkgbase} && chown -R ${hostUid} /pkgbuilds`,
      ],
      binds: [`${pkgbuildsDir}:/pkgbuilds`],
      env: [],
      labels: this.containerLabels(),
      entrypoint: ['sh'],
    });

    const exitCode = await this.docker.startAndWait(container, appendToLog);
    if (exitCode !== 0) {
      throw new Error(`Cloning ${AUR_URL}/${pkgbase}.git failed with exit code ${exitCode}`);
    }

    // The AUR git backend hands out empty repositories for unknown names.
    const pkgbuildPath = path.join(pkgbuildsDir, pkgbase, 'PKGBUILD');
    const pkgbuildExists = await fs
      .stat(pkgbuildPath)
      .then((stat) => stat.isFile())
      .catch(() => false);

    if (!pkgbuildExists) {
      throw new Error(`${pkgbase} does not exist on the AUR: ${AUR_URL}/${pkgbase}.git has no PKGBUILD`);
    }
  }

  private async createBuildContainer(pkgbase: string, pkgbuildsDir: string, artifactDir: string): Promise<Container> {
    return this.docker.createBuildContainer({
      image: this.config.image,
      cmd: ['build', pkgbase],
      binds: [
        `${pkgbuildsDir}:/pkgbuilds`,
        `${artifactDir}:/home/builder/pkgout`,
        `${path.join(this.config.workDir, 'pkgcache')}:/var/cache/pacman/pkg`,
      ],
      env: [
        `BUILDER_HOSTNAME=${BUILDER_HOSTNAME}`,
        `BUILDER_TIMEOUT=${this.config.builderTimeoutSeconds}`,
        `EXTRA_PACMAN_REPOS=${this.config.extraPacmanRepos}`,
        `EXTRA_PACMAN_KEYRINGS=${this.config.extraPacmanKeyrings}`,
        `MAKEFLAGS=-j${this.config.cpuLimit}`,
      ],
      hostConfig: {
        CpuPeriod: 100000,
        CpuQuota: 100000 * this.config.cpuLimit,
        Memory: this.config.memoryLimitMiB * 1024 * 1024,
        PidsLimit: this.config.pidsLimit,
      },
      labels: this.containerLabels(),
    });
  }

  private startWatchdog(
    container: Container,
    pkgbase: string,
    collector: ContainerStatsCollector,
    appendToLog: (chunk: string) => void,
  ): void {
    this.watchdog = new ContainerActivityWatchdog({
      getUsage: () => this.docker.getUsage(container),
      // With idle detection disabled, sampling continues without ever timing out
      idleTimeoutMs:
        this.config.idleTimeoutSeconds > 0 ? this.config.idleTimeoutSeconds * 1000 : Number.POSITIVE_INFINITY,
      pollIntervalMs: this.config.pollIntervalMs,
      onSample: (usage: ContainerUsage) => collector.addSample(usage),
      onTimeout: (lastUsage: ContainerUsage) => {
        this.idleTerminated = true;
        const usage = formatContainerUsage(lastUsage);
        this.pino.warn(
          { pkgbase, usage },
          `Cancelling portable build: no container activity for ${this.config.idleTimeoutSeconds} seconds`,
        );
        appendToLog(
          `\nNo container activity for ${this.config.idleTimeoutSeconds} seconds, cancelling the build.\n` +
            `Last recorded container usage: ${usage}\n`,
        );
        this.docker.kill(container).catch((err: unknown) => {
          this.pino.error({ err, pkgbase }, 'Failed to kill idle build container');
        });
      },
    });
    this.watchdog.start();
  }

  private stopWatchdog(): void {
    this.watchdog?.stop();
    this.watchdog = null;
  }

  /** Makes the builder-user-owned artifacts readable for the backend and scanners, then lists them. */
  private async collectArtifacts(
    build: PortableBuild,
    artifactDir: string,
    logBuffer: CappedLogBuffer,
    resourceStats: Awaited<ReturnType<ContainerStatsCollector['getStats']>>,
  ): Promise<string[] | null> {
    await this.docker.chmodRecursive(artifactDir, this.config.image, this.containerLabels());

    const artifacts = (await fs.readdir(artifactDir)).filter((name) => name.endsWith(ARTIFACT_SUFFIX)).sort();
    if (artifacts.length === 0) {
      await this.finish(build, 'failed', logBuffer, resourceStats, 'No packages were built');
      return null;
    }

    return artifacts;
  }

  private async finish(
    build: PortableBuild,
    status: PortableBuildStatus,
    logBuffer: CappedLogBuffer,
    resourceStats: Awaited<ReturnType<ContainerStatsCollector['getStats']>>,
    error: string | null,
    artifacts?: string[],
    scan?: PortableArtifactScan,
  ): Promise<void> {
    await this.builds.update(build.id, {
      status,
      finishedAt: new Date(),
      log: logBuffer.toString(),
      resourceStats,
      error,
      artifacts: artifacts ?? null,
      scan: scan ?? null,
    });
    this.pino.info(
      { buildId: build.id, pkgbase: build.pkgbase, status, error, resourceStats },
      'Portable build finished',
    );
  }

  private containerLabels(): Record<string, string> {
    return { [CONTAINER_LABEL]: 'true' };
  }
}
