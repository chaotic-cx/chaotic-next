import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

const execFileP = promisify(execFile);

const FETCH_TIMEOUT_MS = 60_000;
const FULL_FETCH_TIMEOUT_MS = 30 * 60 * 1000;
const BRANCH_FETCH_TTL_MS = 30 * 60 * 1000;
const READ_TIMEOUT_MS = 15_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES_PER_PACKAGE = 10;
const TEXT_SNIFF_BYTES = 8192;
const CONTROL_BYTE_RATIO_LIMIT = 0.1;
const PACKAGE_BASE_PATTERN = /^[a-z0-9][a-z0-9@._+-]*$/i;

export type MirrorFile = { content: string } | { binary: true };

@Injectable()
export class AurMirrorService implements OnModuleInit {
  private ready = false;
  private syncing = false;
  private readonly branchFetchedAt = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    @InjectPinoLogger(AurMirrorService.name) private readonly pino: PinoLogger,
  ) {}

  get mirrorPath(): string {
    return resolve(process.cwd(), this.configService.get<string>('aur.mirrorPath') ?? 'tmp/aur-mirror');
  }

  get mirrorUrl(): string {
    return this.configService.get<string>('aur.mirrorUrl') ?? 'https://github.com/archlinux/aur.git';
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureRepo();
      this.ready = true;
    } catch (err) {
      this.pino.warn({ err }, 'AUR mirror unavailable, scans fall back to HTTP');
      return;
    }
    void this.warmup();
  }

  private async warmup(): Promise<void> {
    this.pino.info('AUR mirror initial fetch started');
    await this.sync();
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sync(): Promise<void> {
    if (!this.ready || this.syncing) return;
    this.syncing = true;
    try {
      await this.git(['fetch', '--depth=1', 'origin'], FULL_FETCH_TIMEOUT_MS);
      this.branchFetchedAt.clear();
      this.pino.debug('AUR mirror sync finished');
    } catch (err) {
      this.pino.warn({ err }, 'AUR mirror sync failed');
    } finally {
      this.syncing = false;
    }
  }

  async readTextFile(packageBase: string, path: string): Promise<MirrorFile | undefined> {
    if (!(await this.ensurePackageRef(packageBase))) return undefined;
    if (!isSafePath(path)) return undefined;
    try {
      const { stdout } = await this.gitBuffer(['show', `${refOf(packageBase)}:${path}`], READ_TIMEOUT_MS);
      if (stdout.length > MAX_FILE_BYTES) return { binary: true };
      if (!looksTextual(stdout)) return { binary: true };
      return { content: stdout.toString('utf8') };
    } catch {
      return undefined;
    }
  }

  async readPackageFiles(
    packageBase: string,
  ): Promise<{ files: { name: string; content: string }[]; skippedBinaryFiles: string[] } | undefined> {
    if (!(await this.ensurePackageRef(packageBase))) return undefined;
    let paths: string[];
    try {
      const { stdout } = await this.git(['ls-tree', '-r', '--name-only', refOf(packageBase), '--'], READ_TIMEOUT_MS);
      paths = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
    } catch {
      return undefined;
    }
    const files: { name: string; content: string }[] = [];
    const skippedBinaryFiles: string[] = [];
    for (const path of paths.slice(0, MAX_FILES_PER_PACKAGE)) {
      const file = await this.readTextFile(packageBase, path);
      if (!file || 'binary' in file) {
        if (file) skippedBinaryFiles.push(path);
        continue;
      }
      files.push({ name: path, content: file.content });
    }
    return { files, skippedBinaryFiles };
  }

  private async ensureRepo(): Promise<void> {
    await mkdir(dirname(this.mirrorPath), { recursive: true });
    if (!existsSync(this.mirrorPath)) {
      await execFileP('git', ['init', '--bare', this.mirrorPath], { timeout: FETCH_TIMEOUT_MS });
    }
    try {
      await this.git(['remote', 'add', 'origin', this.mirrorUrl], READ_TIMEOUT_MS);
    } catch (err) {
      if (!String((err as { stderr?: unknown }).stderr ?? err).includes('already exists')) throw err;
    }
    await this.git(['config', 'remote.origin.partialclonefilter', 'blob:none'], READ_TIMEOUT_MS);
    await this.git(['remote', 'set-branches', 'origin', '*'], READ_TIMEOUT_MS);
  }

  private async ensurePackageRef(packageBase: string): Promise<boolean> {
    if (!this.ready || !PACKAGE_BASE_PATTERN.test(packageBase)) return false;
    try {
      if (await this.hasFreshRef(packageBase)) return true;
      await this.git(['fetch', '--depth=1', '--no-filter', 'origin', packageBase], FETCH_TIMEOUT_MS);
      await this.git(['rev-parse', '--verify', refOf(packageBase)], READ_TIMEOUT_MS);
      this.branchFetchedAt.set(packageBase, Date.now());
      return true;
    } catch (err) {
      this.pino.debug({ err, packageBase }, 'AUR mirror branch unavailable');
      return false;
    }
  }

  private async hasFreshRef(packageBase: string): Promise<boolean> {
    const fetchedAt = this.branchFetchedAt.get(packageBase);
    if (!fetchedAt || Date.now() - fetchedAt >= BRANCH_FETCH_TTL_MS) return false;
    try {
      await this.git(['rev-parse', '--verify', '--quiet', refOf(packageBase)], READ_TIMEOUT_MS);
      return true;
    } catch {
      return false;
    }
  }

  private git(args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
    return execFileP('git', ['-C', this.mirrorPath, ...args], { timeout, maxBuffer: MAX_FILE_BYTES });
  }

  private async gitBuffer(args: string[], timeout: number): Promise<{ stdout: Buffer }> {
    const result = (await execFileP('git', ['-C', this.mirrorPath, ...args], {
      timeout,
      maxBuffer: MAX_FILE_BYTES,
      encoding: 'buffer',
    })) as unknown as { stdout: Buffer };
    return { stdout: result.stdout };
  }
}

function refOf(packageBase: string): string {
  return `refs/remotes/origin/${packageBase}`;
}

function isSafePath(path: string): boolean {
  return path !== '' && !path.startsWith('/') && !path.includes('\0') && !path.split('/').includes('..');
}

function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, TEXT_SNIFF_BYTES);
  let controlBytes = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32)) controlBytes++;
  }
  return sample.length === 0 || controlBytes / sample.length < CONTROL_BYTE_RATIO_LIMIT;
}
