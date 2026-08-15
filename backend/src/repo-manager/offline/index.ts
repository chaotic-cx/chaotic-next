/**
 * Offline Arch mirror indexer. Scans a locally mounted mirror (read-only) with
 * the same pipeline as the running backend's arch index and writes an importable
 * seed for POST /repo/signals/import.
 *
 * Usage: node index.cjs --mirror <dir> [--repos core,extra] [--arch-dir os/x86_64]
 *                        [--out seed.json] [--concurrency 4]
 * Arch mirrors keep packages under `os/x86_64`; Chaotic-AUR/Garuda put them
 * directly under `x86_64` — set `--arch-dir` to match.
 */
import type { PackageElfAnalysis as AnalysisShape } from '@chaotic-next/shared-lib';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { ParsedPackage } from '../../interfaces/repo-manager';
import { errorMessage } from '../../utils/functions';
import { buildAnalysis } from '../signal';
import { extractPacmanDatabase, parsePacmanDatabases } from './pacman-parse';
import { scanArchive } from './scan-archive';

interface CliOptions {
  mirror: string;
  repos: string[];
  archDir: string;
  out: string;
  concurrency: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: Partial<CliOptions> = { repos: ['core', 'extra'], archDir: 'os/x86_64', concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case '--mirror':
        opts.mirror = value();
        break;
      case '--repos':
        opts.repos = value()
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);
        break;
      case '--out':
        opts.out = value();
        break;
      case '--concurrency':
        opts.concurrency = Number(value());
        break;
      case '--arch-dir':
        opts.archDir = value();
        break;
      case '-h':
      case '--help':
        console.log(`Usage: index.cjs --mirror <dir> [--repos core,extra] [--arch-dir os/x86_64] [--out seed.json] [--concurrency 4]
  Scans a mounted repo mirror (read-only) and writes an importable signal seed.
  --arch-dir sets the per-repo subdirectory holding the .files DB and archives
  (Arch: os/x86_64; Chaotic-AUR/Garuda: x86_64).
  Progress is checkpointed every 100 packages to <out>.partial, so an
  interrupted run can be resumed by re-running the same command.`);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    }
  }
  if (!opts.mirror) throw new Error('--mirror is required');
  if (!opts.out) throw new Error('--out is required');
  if (!opts.repos?.length) throw new Error('--repos must name at least one repo');
  return {
    mirror: isAbsolute(opts.mirror) ? opts.mirror : resolve(opts.mirror),
    repos: opts.repos,
    archDir: opts.archDir ?? 'os/x86_64',
    out: isAbsolute(opts.out) ? opts.out : resolve(opts.out),
    concurrency: Math.max(1, opts.concurrency ?? 4),
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function parseRepoDatabase(mirror: string, repo: string, archDir: string): Promise<ParsedPackage[]> {
  const filesPath = join(mirror, repo, archDir, `${repo}.files`);
  if (!(await pathExists(filesPath))) {
    console.warn(`No database at ${filesPath}, skipping ${repo}`);
    return [];
  }
  const workDir = await mkdtemp(join(tmpdir(), 'offline-index-'));
  try {
    await extractPacmanDatabase(filesPath, workDir);
    return await parsePacmanDatabases([{ name: repo, path: workDir, workDir }]);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

interface SeedEntry {
  pkgType: '0';
  pkgname: string;
  version: string;
  files: string[];
  neededSonames: string[];
  providedSonames: string[];
  importedSymbols: string[];
  exportedSymbols: Record<string, string[]>;
  vtables: Record<string, string[]>;
  directoriesOwned: string[];
  directDirectories: string[];
  pluginOf: string[];
  broken: boolean;
  brokenReasons: string[];
}

export async function loadCheckpoint(out: string): Promise<{ done: Set<string> }> {
  const source = (await pathExists(`${out}.partial`)) ? `${out}.partial` : out;
  if (!(await pathExists(source))) return { done: new Set() };
  const done = new Set<string>();
  const rl = createInterface({ input: createReadStream(source, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry: unknown = JSON.parse(trimmed);
      if (typeof entry === 'object' && entry !== null && 'pkgname' in entry && typeof entry.pkgname === 'string') {
        done.add(entry.pkgname);
      }
    } catch {
      // skip a corrupt line; that package gets re-scanned
    }
  }
  return { done };
}

async function appendEntry(stream: NodeJS.WritableStream, entry: SeedEntry): Promise<void> {
  if (!stream.write(JSON.stringify(entry) + '\n')) {
    await new Promise((resolve) => stream.once('drain', resolve));
  }
}

async function openPartial(out: string): Promise<NodeJS.WritableStream> {
  const partial = `${out}.partial`;
  if (!(await pathExists(partial)) && (await pathExists(out))) {
    await copyFile(out, partial);
  }
  return createWriteStream(partial, { flags: 'a' });
}

async function promotePartial(out: string): Promise<void> {
  const partial = `${out}.partial`;
  await rename(partial, out);
}

export async function writeSeedNdjson(out: string, entries: SeedEntry[]): Promise<void> {
  await mkdir(dirname(out), { recursive: true });
  const stream = createWriteStream(`${out}.tmp`);
  for (const entry of entries) {
    if (!stream.write(JSON.stringify(entry) + '\n')) {
      await new Promise((resolve) => stream.once('drain', resolve));
    }
  }
  await new Promise<void>((resolve, reject) => {
    stream.end((err?: Error) => (err ? reject(err) : resolve()));
  });
  await rename(`${out}.tmp`, out);
}

function installStopHandlers(stream: NodeJS.WritableStream, onStop: () => void): () => void {
  const onSignal = (signal: NodeJS.Signals): void => {
    onStop();
    console.log(`\n${signal} received, flushing partial output...`);
    try {
      stream.end();
    } catch (err) {
      console.error(`Failed to flush partial output: ${errorMessage(err)}`);
    }
    process.exit(0);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return () => {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  };
}

type ScanResult = { kind: 'scanned'; entry: SeedEntry } | { kind: 'missing' } | { kind: 'unreadable'; error?: string };

async function scanPackage(pkg: ParsedPackage, archivePath: string): Promise<ScanResult> {
  if (!(await pathExists(archivePath))) return { kind: 'missing' };
  try {
    const raw = await scanArchive(archivePath);
    if (!raw) return { kind: 'unreadable' };
    for (const warning of raw.warnings) console.warn(warning);
    const analysis: AnalysisShape = buildAnalysis({ version: pkg.version, ...raw });
    return {
      kind: 'scanned',
      entry: {
        pkgType: '0',
        pkgname: pkg.name,
        version: analysis.version,
        files: analysis.files,
        neededSonames: analysis.neededSonames,
        providedSonames: analysis.providedSonames,
        importedSymbols: analysis.importedSymbols,
        exportedSymbols: analysis.exportedSymbols,
        vtables: analysis.vtables,
        directoriesOwned: analysis.directoriesOwned,
        directDirectories: analysis.directDirectories,
        pluginOf: [],
        broken: false,
        brokenReasons: [],
      },
    };
  } catch (err) {
    return { kind: 'unreadable', error: err instanceof Error ? err.message : String(err) };
  }
}

export async function scanMirrorPackages(
  mirror: string,
  packages: ParsedPackage[],
  concurrency: number,
  out: string,
  archDir = 'os/x86_64',
): Promise<{ skipped: number; failed: number; resumed: number }> {
  const candidates = packages.filter((pkg) => pkg.name && pkg.metaData?.filename && pkg.repoName);

  await mkdir(dirname(out), { recursive: true });
  const { done } = await loadCheckpoint(out);
  const resumed = done.size;
  const remaining = candidates.filter((pkg) => !done.has(pkg.name));
  const total = candidates.length;
  let skipped = 0;
  let failed = 0;
  let processed = resumed;

  // Stream finished entries straight to the partial NDJSON; the partial doubles
  // as the checkpoint so a run resumes without re-scanning.
  const partialStream = await openPartial(out);

  let stopping = false;
  const removeStopHandlers = installStopHandlers(partialStream, () => {
    stopping = true;
  });

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < remaining.length && !stopping) {
      const pkg = remaining[cursor++];
      const archivePath = join(mirror, pkg.repoName, archDir, pkg.metaData.filename);
      const result = await scanPackage(pkg, archivePath);
      processed++;
      if (result.kind === 'missing') {
        skipped++;
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[${processed}/${total}] skipped ${pkg.name} (missing ${archivePath})`);
        }
        continue;
      }
      if (result.kind === 'unreadable') {
        failed++;
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[${processed}/${total}] failed ${pkg.name}${result.error ? `: ${result.error}` : ' (unreadable archive)'}`,
          );
        }
        continue;
      }
      await appendEntry(partialStream, result.entry);
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[${processed}/${total}] scanned ${pkg.name} (${result.entry.files.length} files)`);
      }
    }
  };

  const workers = Math.max(1, Math.min(concurrency, remaining.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  removeStopHandlers();
  await new Promise<void>((resolve, reject) => {
    partialStream.end((err?: Error) => (err ? reject(err) : resolve()));
  });
  await promotePartial(out);
  return { skipped, failed, resumed };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!(await pathExists(opts.mirror))) {
    throw new Error(`Mirror directory not found: ${opts.mirror}`);
  }

  console.log(`Parsing databases for repos: ${opts.repos.join(', ')}`);
  const parsed: ParsedPackage[] = [];
  for (const repo of opts.repos) {
    parsed.push(...(await parseRepoDatabase(opts.mirror, repo, opts.archDir)));
  }
  console.log(`Parsed ${parsed.length} packages from ${opts.repos.length} repo database(s)`);

  console.log(`Scanning package archives with concurrency ${opts.concurrency}...`);
  const { skipped, failed, resumed } = await scanMirrorPackages(
    opts.mirror,
    parsed,
    opts.concurrency,
    opts.out,
    opts.archDir,
  );

  let count = 0;
  const rl = createInterface({ input: createReadStream(opts.out, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) count++;
  }
  console.log(`Scanned ${count} packages (${resumed} resumed, ${skipped} skipped, ${failed} failed)`);
  console.log(`Wrote seed with ${count} analyses to ${opts.out}`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
