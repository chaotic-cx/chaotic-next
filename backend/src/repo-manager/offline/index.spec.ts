import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ParsedPackage } from '../../interfaces/repo-manager';
import { loadCheckpoint, scanMirrorPackages, writeSeedNdjson } from './index';

const FMT_PKG = join(__dirname, '..', '__fixtures__', 'fmt-12.0.0-1-x86_64.pkg.tar.zst');

const fmtPkg: ParsedPackage = {
  name: 'fmt',
  base: 'fmt',
  version: '12.0.0',
  pkgrel: 1,
  repoName: 'extra',
  metaData: { filename: 'fmt-12.0.0-1-x86_64.pkg.tar.zst', buildDate: '' },
};

async function countLines(path: string): Promise<number> {
  const content = await readFile(path, 'utf8');
  return content
    .trim()
    .split('\n')
    .filter((l) => l).length;
}

describe('offline indexer checkpoint/resume', () => {
  let mirror: string;

  beforeAll(async () => {
    mirror = await mkdtemp(join(tmpdir(), 'index-mirror-'));
    const pkgDir = join(mirror, 'extra', 'os', 'x86_64');
    await mkdir(pkgDir, { recursive: true });
    await copyFile(FMT_PKG, join(pkgDir, 'fmt-12.0.0-1-x86_64.pkg.tar.zst'));
  }, 30000);

  afterAll(async () => {
    await rm(mirror, { recursive: true, force: true });
  });

  it('scans a real mirror layout and writes the seed as NDJSON', async () => {
    const out = join(mirror, 'scan.ndjson');
    const result = await scanMirrorPackages(mirror, [fmtPkg], 2, out);
    expect(result.resumed).toBe(0);
    expect(result.failed).toBe(0);
    expect(await countLines(out)).toBe(1);
    const content = await readFile(out, 'utf8');
    expect(JSON.parse(content.trim())).toMatchObject({ pkgname: 'fmt', version: '12.0.0' });
  }, 60000);

  it('resumes from a checkpoint without re-scanning done packages', async () => {
    const out = join(mirror, 'resume.ndjson');
    // seed the checkpoint by scanning once, then resume
    await scanMirrorPackages(mirror, [fmtPkg], 2, out);

    const checkpoint = await loadCheckpoint(out);
    expect(checkpoint.done.has('fmt')).toBe(true);

    const result = await scanMirrorPackages(mirror, [fmtPkg], 2, out);
    expect(result.resumed).toBe(1);
    expect(await countLines(out)).toBe(1);
  }, 60000);

  it('skips packages whose archive is missing', async () => {
    const out = join(mirror, 'missing.ndjson');
    const missing: ParsedPackage = {
      ...fmtPkg,
      name: 'does-not-exist',
      metaData: { filename: 'does-not-exist-1-1-x86_64.pkg.tar.zst', buildDate: '' },
    };
    const result = await scanMirrorPackages(mirror, [missing], 2, out);
    expect(result.skipped).toBe(1);
    // nothing is written for a skipped package
    expect(await countLines(out)).toBe(0);
  }, 60000);

  it('resumes from a pre-existing NDJSON partial (Ctrl+C path)', async () => {
    const freshOut = join(mirror, 'ctrl-c.ndjson');
    const partial = `${freshOut}.partial`;
    // Simulate a partial left behind by an interrupted run.
    await writeFile(
      partial,
      JSON.stringify({
        pkgType: '0',
        pkgname: 'fmt',
        version: '12.0.0',
        files: [],
        neededSonames: [],
        providedSonames: [],
        importedSymbols: [],
        exportedSymbols: {},
        vtables: {},
        directoriesOwned: [],
        directDirectories: [],
        pluginOf: [],
        broken: false,
        brokenReasons: [],
      }) + '\n',
    );

    const { done } = await loadCheckpoint(freshOut);
    expect(done.has('fmt')).toBe(true);

    const result = await scanMirrorPackages(mirror, [fmtPkg], 2, freshOut);
    expect(result.resumed).toBe(1);
    expect(await countLines(freshOut)).toBe(1);
  }, 60000);

  it('writeSeedNdjson writes one JSON entry per line, ready for streaming import', async () => {
    const ndjson = join(mirror, 'seed2.ndjson');
    await writeSeedNdjson(ndjson, [
      { pkgType: '0', pkgname: 'a', version: '1.0-1', files: [] } as never,
      { pkgType: '0', pkgname: 'b', version: '2.0-1', files: [] } as never,
    ]);

    const content = await readFile(ndjson, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ pkgname: 'a', version: '1.0-1' });
    expect(JSON.parse(lines[1])).toMatchObject({ pkgname: 'b', version: '2.0-1' });
  }, 60000);
});
