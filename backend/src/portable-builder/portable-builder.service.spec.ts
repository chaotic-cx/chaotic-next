import { ConflictException } from '@nestjs/common';
import type { PortableBuilderConfig } from '../config/portable-builder.config';
import type { PinoLogger } from 'nestjs-pino';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseClamavOutput, parseScanDump } from './artifact-scan.service';
import type { ContainerUsage } from './container-usage';
import type { CreateBuildContainerOptions } from './docker.service';
import { PORTABLE_BUILD_ACTIVE_STATUSES, type PortableBuild } from './portable-build.entity';
import { CappedLogBuffer, PortableBuilderService } from './portable-builder.service';

const PINO_STUB = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;

type Row = {
  id: number;
  pkgbase: string;
  status: string;
  issueNumber: number | null;
  [key: string]: unknown;
};

class FakeDocker {
  readonly created: CreateBuildContainerOptions[] = [];
  cloneExitCode = 0;
  buildExitCode = 0;
  usage: ContainerUsage | null = null;
  killed = 0;
  /** Keeps the build container running until kill() resolves it; used for the idle timeout test. */
  holdBuild = false;
  onBuildStart?: (options: CreateBuildContainerOptions) => void | Promise<void>;
  private resolveBuild: ((exitCode: number) => void) | null = null;

  async createBuildContainer(options: CreateBuildContainerOptions): Promise<CreateBuildContainerOptions> {
    this.created.push(options);
    return options;
  }

  async startAndWait(container: CreateBuildContainerOptions, onOutput: (chunk: string) => void): Promise<number> {
    if ((container.entrypoint?.length ?? 0) > 0) {
      onOutput('Cloning into /pkgbuilds...\n');
      const pkgbuildsHost = container.binds.find((bind) => bind.endsWith(':/pkgbuilds'));
      const hostDir = pkgbuildsHost?.split(':/')[0];
      if (hostDir) {
        await fs.mkdir(path.join(hostDir, 'paru'), { recursive: true });
        await fs.writeFile(path.join(hostDir, 'paru', 'PKGBUILD'), 'pkgbase=paru');
      }
      return this.cloneExitCode;
    }
    await this.onBuildStart?.(container as CreateBuildContainerOptions);
    if (this.holdBuild) {
      return new Promise((resolve) => {
        this.resolveBuild = resolve;
      });
    }
    return this.buildExitCode;
  }

  async getUsage(): Promise<ContainerUsage | null> {
    return this.usage;
  }

  async kill(): Promise<void> {
    this.killed++;
    this.resolveBuild?.(137);
    this.resolveBuild = null;
  }

  async sweepLabeled(): Promise<number> {
    return 0;
  }

  async chmodRecursive(): Promise<void> {
    await Promise.resolve();
  }
}

function makeRepo() {
  const rows = new Map<number, Row>();
  let nextId = 1;
  const statuses = PORTABLE_BUILD_ACTIVE_STATUSES as readonly string[];
  return {
    rows,
    exists: async (criteria: { where: { pkgbase: string } }) =>
      [...rows.values()].some((row) => row.pkgbase === criteria.where.pkgbase && statuses.includes(row.status)),
    create: (value: Partial<Row>) => value,
    save: async (value: Partial<Row>) => {
      const row: Row = {
        issueNumber: null,
        log: null,
        error: null,
        artifacts: null,
        resourceStats: null,
        startedAt: null,
        finishedAt: null,
        ...value,
        id: nextId++,
        pkgbase: value.pkgbase ?? '',
        status: value.status ?? 'queued',
      };
      rows.set(row.id, row);
      return row;
    },
    update: async (id: number, patch: Partial<Row>) => {
      rows.set(id, { ...rows.get(id), ...patch } as Row);
    },
    findOne: async (criteria: { where: { status: string } }) =>
      [...rows.values()].find((row) => row.status === criteria.where.status) ?? null,
    findOneBy: async (criteria: { id: number }) => rows.get(criteria.id) ?? null,
  } as unknown as Repository<PortableBuild> & { rows: Map<number, Row> };
}

function makeConfig(workDir: string, idleTimeoutSeconds = 0): PortableBuilderConfig {
  return {
    dockerSocket: '/var/run/docker.sock',
    image: 'builder:test',
    workDir,
    publicBaseUrl: 'https://builds.example.test/api',
    cpuLimit: 2,
    memoryLimitMiB: 2048,
    pidsLimit: 512,
    idleTimeoutSeconds,
    pollIntervalMs: 50,
    builderTimeoutSeconds: 3600,
    extraPacmanRepos: '[builder]\nServer = file:///repo',
    extraPacmanKeyrings: '',
    clamavImage: '',
  };
}

function makeService(workDir: string, docker: FakeDocker, idleTimeoutSeconds = 0) {
  const repo = makeRepo();
  const service = new PortableBuilderService(
    { getOrThrow: () => makeConfig(workDir, idleTimeoutSeconds) } as never,
    repo as unknown as Repository<PortableBuild>,
    docker as never,
    {
      scanArtifacts: async () => ({ status: 'clean', scannedFiles: 0, findings: [], virusTotal: [] }),
    } as never,
    PINO_STUB,
  );
  return { repo, service };
}

function rowOf(repo: { rows: Map<number, Row> }, id: number): Row {
  const row = repo.rows.get(id);
  expect(row).toBeDefined();
  return row as Row;
}

function createdContainer(docker: FakeDocker, index: number): CreateBuildContainerOptions {
  const container = docker.created[index];
  expect(container).toBeDefined();
  return container as CreateBuildContainerOptions;
}

describe('PortableBuilderService.enqueue', () => {
  it('rejects invalid pkgbases', async () => {
    const { service } = makeService('/nonexistent', new FakeDocker());
    await expect(service.enqueue('Foo Bar')).rejects.toThrow(/not a valid AUR pkgbase/);
    await expect(service.enqueue('../etc/passwd')).rejects.toThrow(/not a valid AUR pkgbase/);
  });

  it('rejects a second active build of the same pkgbase', async () => {
    const docker = new FakeDocker();
    const { service } = makeService('/nonexistent', docker);
    docker.onBuildStart = () => undefined;
    await service.enqueue('paru');
    await expect(service.enqueue('paru')).rejects.toThrow(ConflictException);
    await service.drain();
  });
});

describe('PortableBuilderService build flow', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portable-builder-spec-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('clones from the AUR, builds, and publishes artifacts', async () => {
    const docker = new FakeDocker();
    const { repo, service } = makeService(workDir, docker);
    const finished: PortableBuild[] = [];
    service.jobFinished$.subscribe((build) => finished.push(build));

    docker.onBuildStart = async (options) => {
      const pkgout = options.binds.find((bind) => bind.includes('/home/builder/pkgout'));
      expect(pkgout).toBeDefined();
      const artifactDir = (pkgout as string).split(':/')[0];
      expect(artifactDir).toBeDefined();
      await fs.writeFile(path.join(artifactDir as string, 'paru-2.0-1-x86_64.pkg.tar.zst'), 'artifact');
    };

    const build = await service.enqueue('paru');
    await service.drain();

    const row = rowOf(repo, build.id);
    expect(row.status).toBe('success');
    expect(row.error).toBeNull();
    expect(row.artifacts).toEqual(['paru-2.0-1-x86_64.pkg.tar.zst']);
    expect(finished.map((entry) => entry.id)).toEqual([build.id]);
    await expect(fs.stat(path.join(workDir, 'jobs', String(build.id)))).rejects.toThrow();

    const clone = createdContainer(docker, 0);
    const buildContainer = createdContainer(docker, 1);
    expect(clone.entrypoint).toEqual(['sh']);
    expect(clone.cmd[0]).toBe('-c');
    expect(clone.cmd[1]).toContain('git clone --depth=1 https://aur.archlinux.org/paru.git /pkgbuilds/paru');
    expect(clone.cmd[1]).toContain('chown -R');
    expect(buildContainer.cmd).toEqual(['build', 'paru']);
    expect(buildContainer.entrypoint).toBeUndefined();
    expect(buildContainer.hostConfig).toMatchObject({
      CpuQuota: 200000,
      Memory: 2048 * 1024 * 1024,
      PidsLimit: 512,
    });
    expect(buildContainer.env).toContain('MAKEFLAGS=-j2');
    expect(buildContainer.binds.some((bind) => bind.includes('/home/builder/pkgout'))).toBe(true);
    expect(buildContainer.binds.some((bind) => bind.includes('/var/cache/pacman/pkg'))).toBe(true);
  });

  it('fails with a clone error when the pkgbase does not exist', async () => {
    const docker = new FakeDocker();
    docker.cloneExitCode = 128;
    const { repo, service } = makeService(workDir, docker);

    const build = await service.enqueue('does-not-exist');
    await service.drain();

    const row = rowOf(repo, build.id);
    expect(row.status).toBe('failed');
    expect(row.error).toContain('aur.archlinux.org/does-not-exist.git');
    expect(row.artifacts).toBeNull();
    expect(docker.created).toHaveLength(1);
  });

  it('fails when the build container exits non-zero', async () => {
    const docker = new FakeDocker();
    docker.buildExitCode = 1;
    const { repo, service } = makeService(workDir, docker);

    const build = await service.enqueue('paru');
    await service.drain();

    const row = rowOf(repo, build.id);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('Build exited with code 1');
  });

  it('fails when the build produced no packages', async () => {
    const docker = new FakeDocker();
    const { repo, service } = makeService(workDir, docker);

    const build = await service.enqueue('paru');
    await service.drain();

    const row = rowOf(repo, build.id);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('No packages were built');
  });

  it('times the build out via the activity watchdog', async () => {
    const docker = new FakeDocker();
    docker.holdBuild = true;
    docker.usage = {
      cpu_accumulated_ns: 50_000_000,
      memory_bytes: 100 * 1024 * 1024,
      network_rx_bytes: 0,
      network_tx_bytes: 0,
      disk_read_bytes: 0,
      disk_write_bytes: 0,
      pids_current: 3,
    };
    const { repo, service } = makeService(workDir, docker, 0.2);

    const build = await service.enqueue('paru');
    await service.drain();

    const row = rowOf(repo, build.id);
    expect(row.status).toBe('timed-out');
    expect(docker.killed).toBe(1);
    expect(row.log).toContain('No container activity');
    expect(row.resourceStats).not.toBeNull();
    expect((row.resourceStats as { sample_count: number }).sample_count).toBeGreaterThanOrEqual(1);
  }, 10_000);
});

describe('CappedLogBuffer', () => {
  it('keeps small logs verbatim', () => {
    const buffer = new CappedLogBuffer(100, 50);
    buffer.append('hello\n');
    expect(buffer.toString()).toBe('hello\n');
  });

  it('keeps head and tail once the cap is exceeded', () => {
    const buffer = new CappedLogBuffer(10, 10);
    buffer.append('start...');
    buffer.append('x'.repeat(1000));
    buffer.append('end!');
    const text = buffer.toString();
    expect(text.startsWith('start...')).toBe(true);
    expect(text.endsWith('end!')).toBe(true);
    expect(text).toContain('log truncated');
    expect(Buffer.byteLength(text)).toBeLessThan(1100);
  });
});

describe('parseScanDump', () => {
  it('parses hashes and text blocks into per-file records', () => {
    const hash1 = 'a'.repeat(64);
    const hash2 = 'b'.repeat(64);
    const hash3 = 'c'.repeat(64);
    const dump = [
      `${hash1}  .PKGINFO`,
      `${hash2}  usr/bin/tool`,
      '===TEXT=== .PKGINFO',
      'pkgname = tool',
      '===END===',
      `${hash3}  usr/lib/libtool.so`,
      '===TEXT=== usr/lib/tool.conf',
      '[section]',
      'key = value',
      '===END===',
    ].join('\n');

    expect(parseScanDump(dump)).toEqual([
      { name: '.PKGINFO', sha256: hash1, text: 'pkgname = tool\n' },
      { name: 'usr/bin/tool', sha256: hash2, text: null },
      { name: 'usr/lib/libtool.so', sha256: hash3, text: null },
      { name: 'usr/lib/tool.conf', sha256: '', text: '[section]\nkey = value\n' },
    ]);
  });

  it('merges a text block that appears before its hash line', () => {
    const hash = 'd'.repeat(64);
    const dump = ['===TEXT=== PKGBUILD', 'pkgbase=x', '===END===', `${hash}  PKGBUILD`].join('\n');
    expect(parseScanDump(dump)).toEqual([{ name: 'PKGBUILD', sha256: hash, text: 'pkgbase=x\n' }]);
  });

  it('returns an empty list for empty dumps', () => {
    expect(parseScanDump('')).toEqual([]);
  });
});

describe('parseClamavOutput', () => {
  it('extracts detections and ignores clean output', () => {
    const output = [
      '/scan/eicar.com: Eicar-Test-Signature FOUND',
      '/scan/usr/bin/tool: Unix.Tool-123 FOUND',
      '--- scan summary ---',
    ].join('\n');
    expect(parseClamavOutput(output)).toEqual([
      { file: '/scan/eicar.com', signature: 'Eicar-Test-Signature' },
      { file: '/scan/usr/bin/tool', signature: 'Unix.Tool-123' },
    ]);
    expect(parseClamavOutput('')).toEqual([]);
  });
});
