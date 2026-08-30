import { Package } from '../builder/builder.entity';
import { TriggerType } from '../interfaces/repo-manager';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { SignalScanService, type ScanJob } from '../repo-manager/scan';
import { bootstrapScript, runScript } from '../utils/script-utils';
import { downloadFile } from '../utils/download';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DataSource, In } from 'typeorm';

type RepoKind = 'arch' | 'chaotic';
const REPO_KINDS: RepoKind[] = ['arch', 'chaotic'];

const DEFAULT_MIRROR_URL = 'https://geo.mirror.pkgbuild.com';
const DEFAULT_ARCH_REPOS = 'core,extra';

interface RescanContext {
  http: HttpService;
  ds: DataSource;
  tempDir: string;
  mirrorUrl: string;
  repos: string[];
}

function usage(): never {
  console.error('Usage: rescan-packages.script.ts <arch|chaotic> <pkgname>[,<pkgname>...]');
  process.exit(1);
}

async function isUrlServed(http: HttpService, url: string): Promise<boolean> {
  try {
    const head = await http.axiosRef({ url, method: 'HEAD' });
    return head.status >= 200 && head.status < 300;
  } catch (err) {
    if (!isAxiosError(err) || err.response === undefined) {
      console.warn(`HEAD ${url} failed: ${err instanceof Error ? err.message : err}`);
    }
    return false;
  }
}

async function downloadToFile(http: HttpService, url: string, file: string): Promise<void> {
  await downloadFile(http.axiosRef, url, file);
}

async function buildArchJob(ctx: RescanContext, pkg: ArchlinuxPackage): Promise<ScanJob | null> {
  const filename = (pkg.metadata as { filename?: string } | null)?.filename;
  if (!filename || !pkg.version) {
    console.warn(`Skipping ${pkg.pkgname}: no filename or version`);
    return null;
  }
  let url: string | null = null;
  for (const repo of ctx.repos) {
    const candidate = `${ctx.mirrorUrl}/${repo}/os/x86_64/${filename}`;
    if (await isUrlServed(ctx.http, candidate)) {
      url = candidate;
      break;
    }
  }
  if (!url) {
    console.warn(`Skipping ${pkg.pkgname}: ${filename} not found on mirror`);
    return null;
  }
  const file = join(ctx.tempDir, filename);
  console.log(`Downloading ${pkg.pkgname} from ${url}...`);
  await downloadToFile(ctx.http, url, file);
  return { file, pkgType: TriggerType.ARCH, pkgId: pkg.id, version: pkg.version };
}

async function buildChaoticJob(ctx: RescanContext, pkg: Package): Promise<ScanJob | null> {
  if (pkg.skipSignalScan) {
    console.log(`Skipping ${pkg.pkgname}: marked binary-only (skip signal scan)`);
    return null;
  }
  const filename = (pkg.metadata as { filename?: string } | null)?.filename;
  const baseUrl = pkg.repo?.dbPath ? dirname(pkg.repo.dbPath) : '';
  if (!baseUrl || !filename || !pkg.version) {
    console.warn(`Skipping ${pkg.pkgname}: no download URL or version`);
    return null;
  }
  const url = `${baseUrl}/${filename}`;
  const file = join(ctx.tempDir, filename);
  console.log(`Downloading ${pkg.pkgname} from ${url}...`);
  await downloadToFile(ctx.http, url, file);
  return { file, pkgType: TriggerType.CHAOTIC, pkgId: pkg.id, version: pkg.version };
}

async function buildScanJobs(kind: RepoKind, pkgnames: string[], ctx: RescanContext): Promise<ScanJob[]> {
  const jobs =
    kind === 'arch'
      ? await Promise.all(
          (await ctx.ds.getRepository(ArchlinuxPackage).find({ where: { pkgname: In(pkgnames) } })).map((pkg) =>
            buildArchJob(ctx, pkg),
          ),
        )
      : await Promise.all(
          (
            await ctx.ds.getRepository(Package).find({ where: { pkgname: In(pkgnames) }, relations: { repo: true } })
          ).map((pkg) => buildChaoticJob(ctx, pkg)),
        );
  return jobs.filter((job): job is ScanJob => job !== null);
}

async function main(): Promise<void> {
  const [kindArg, ...nameArgs] = process.argv.slice(2);
  const kind = REPO_KINDS.find((candidate) => candidate === kindArg);
  const pkgnames = nameArgs.flatMap((arg) => arg.split(',')).filter(Boolean);
  if (!kind || pkgnames.length === 0) usage();

  const app = await bootstrapScript(['debug', 'log', 'warn', 'error']);
  const service = app.get(SignalScanService);
  const ctx: RescanContext = {
    http: app.get(HttpService),
    ds: app.get(DataSource),
    tempDir: await mkdtemp(join(tmpdir(), 'rescan-')),
    mirrorUrl: process.env.ARCH_MIRROR_URL ?? DEFAULT_MIRROR_URL,
    repos: (process.env.ARCH_REPOS ?? DEFAULT_ARCH_REPOS).split(','),
  };

  try {
    const jobs = await buildScanJobs(kind, pkgnames, ctx);
    if (jobs.length === 0) {
      console.log('No packages to rescan');
      return;
    }
    await service.scanPackages(jobs);
    await service.recomputeBroken();
    console.log(`Rescanned ${jobs.length} ${kind} package(s)`);
  } finally {
    await rm(ctx.tempDir, { recursive: true, force: true });
    await app.close();
  }
}

runScript(main);
