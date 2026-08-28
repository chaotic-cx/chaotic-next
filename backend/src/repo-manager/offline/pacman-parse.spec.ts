import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parsePkgrel } from '@chaotic-next/shared-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractBaseAndVersion, parsePackageDesc, parsePackageFiles, parsePacmanDatabases } from './pacman-parse';

const execFileP = promisify(execFile);

const FIXTURE_DB = join(import.meta.dirname, '..', '__fixtures__', 'pacman', 'testrepo.files.tar.zst');

describe('extractBaseAndVersion (real fmt desc payload)', () => {
  let extractedDir: string;
  let fmtDesc: string;

  beforeAll(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), 'chaotic-pacman-'));
    await execFileP('bsdtar', ['-xf', FIXTURE_DB, '-C', extractedDir]);
    fmtDesc = await readFile(join(extractedDir, 'fmt-12.0.0-1', 'desc'), 'utf-8');
  });

  afterAll(async () => {
    await rm(extractedDir, { recursive: true, force: true });
  });

  it('parses the core identity fields', () => {
    const parsed = extractBaseAndVersion(fmtDesc);
    expect(parsed.name).toBe('fmt');
    expect(parsed.base).toBe('fmt');
    expect(parsed.version).toBe('12.0.0');
    expect(parsed.pkgrel).toBe(1);
  });

  it('parses the metadata (url, license, packager, build date)', () => {
    const parsed = extractBaseAndVersion(fmtDesc);
    expect(parsed.metaData).toMatchObject({
      url: 'https://fmt.dev',
      license: 'MIT',
      packager: 'Carl Smedstad <carsme@archlinux.org>',
      buildDate: '1759568877',
      desc: 'Open-source formatting library for C++',
      filename: 'fmt-12.0.0-1-x86_64.pkg.tar.zst',
      provides: ['libfmt.so=12-64'],
      deps: ['gcc-libs', 'glibc'],
    });
  });

  it('parses makeDeps as a list', () => {
    const parsed = extractBaseAndVersion(fmtDesc);
    expect(parsed.metaData?.makeDeps).toContain('cmake');
    expect(parsed.metaData?.makeDeps).toContain('ninja');
    expect(parsed.metaData?.makeDeps).toContain('python-regex');
  });
});

describe('parsePacmanDatabases (real vendored repo database)', () => {
  let extractedDir: string;

  beforeAll(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), 'chaotic-pacman-'));
    await execFileP('bsdtar', ['-xf', FIXTURE_DB, '-C', extractedDir]);
  });

  afterAll(async () => {
    await rm(extractedDir, { recursive: true, force: true });
  });

  it('parses every package from the real database', async () => {
    const parsed = await parsePacmanDatabases([{ name: 'chaotic-aur', path: extractedDir, workDir: extractedDir }]);
    expect(parsed.map((p) => p.name).sort()).toEqual(['boost-libs', 'fmt']);
  });

  it('resolves the real fmt package payload', async () => {
    const parsed = await parsePacmanDatabases([{ name: 'chaotic-aur', path: extractedDir, workDir: extractedDir }]);
    const fmt = parsed.find((p) => p.name === 'fmt');
    if (!fmt) throw new Error('fmt missing from parsed database');
    expect(fmt).toMatchObject({
      base: 'fmt',
      version: '12.0.0',
      pkgrel: 1,
      bump: 0,
      repoName: 'chaotic-aur',
    });
    expect(fmt.metaData.url).toBe('https://fmt.dev');
  });

  it('splits a fractional pkgrel into its integer part and the Chaotic-AUR bump', () => {
    expect(parsePkgrel('2.1')).toEqual({ pkgrel: 2, bump: 1 });
    expect(parsePkgrel('2')).toEqual({ pkgrel: 2, bump: 0 });
    expect(parsePkgrel('0')).toEqual({ pkgrel: 0, bump: 0 });
  });

  it('extracts real sonames from the fmt files payload', async () => {
    const parsed = await parsePacmanDatabases([{ name: 'chaotic-aur', path: extractedDir, workDir: extractedDir }]);
    const fmt = parsed.find((p) => p.name === 'fmt');
    if (!fmt) throw new Error('fmt missing from parsed database');
    // fmt ships usr/lib/libfmt.so.12
    expect(fmt.metaData.soNameList).toContain('libfmt.so.12');
    // plain symlink / unversioned lib is not a soname
    expect(fmt.metaData.soNameList).not.toContain('libfmt.so');
  });

  it('extracts patch-versioned sonames from the boost-libs files payload', async () => {
    const parsed = await parsePacmanDatabases([{ name: 'chaotic-aur', path: extractedDir, workDir: extractedDir }]);
    const boost = parsed.find((p) => p.name === 'boost-libs');
    if (!boost) throw new Error('boost-libs missing from parsed database');
    expect(boost.metaData.soNameList).toContain('libboost_atomic.so.1.91.0');
    expect(boost.metaData.soNameList).toContain('libboost_thread.so.1.91.0');
    // archives are not sonames
    expect(boost.metaData.soNameList).not.toContain('libboost_atomic.a');
  });
});

describe('parsePackageDesc / parsePackageFiles on real payloads', () => {
  let extractedDir: string;

  beforeAll(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), 'chaotic-payload-'));
    await execFileP('bsdtar', ['-xf', FIXTURE_DB, '-C', extractedDir]);
  });

  afterAll(async () => {
    await rm(extractedDir, { recursive: true, force: true });
  });

  it('reads a real desc from disk', async () => {
    const desc = await parsePackageDesc(join(extractedDir, 'fmt-12.0.0-1', 'desc'));
    expect(desc.name).toBe('fmt');
    expect(desc.version).toBe('12.0.0');
  });

  it('reads real sonames from a files payload on disk', async () => {
    const sonames = await parsePackageFiles(join(extractedDir, 'fmt-12.0.0-1', 'files'));
    expect(sonames).toContain('libfmt.so.12');
  });

  it('returns an empty object for a missing desc file', async () => {
    expect(await parsePackageDesc(join(extractedDir, 'does-not-exist', 'desc'))).toEqual({});
  });
});
