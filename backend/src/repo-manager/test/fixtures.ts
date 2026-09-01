import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

interface FixturePackage {
  key: string;
  filename: string;
  sha256: string;
  pkgType: 'ARCH' | 'CHAOTIC';
  pkgId: number;
  pkgname: string;
  version: string;
}

interface Manifest {
  packages: FixturePackage[];
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, 'packages.json'), 'utf-8')) as Manifest;
}

async function sha256Of(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

export interface FixtureSet {
  paths: Map<string, string>;
  packages: FixturePackage[];
}

export async function ensureFixtures(): Promise<FixtureSet> {
  const manifest = readManifest();
  const paths = new Map<string, string>();

  for (const pkg of manifest.packages) {
    const dest = join(FIXTURES_DIR, pkg.filename);
    if (!existsSync(dest)) {
      throw new Error(
        `Missing fixture ${pkg.filename}. Run 'pnpm fixtures:fetch' (or: node tools/fetch-fixtures.mjs) to download it from ${process.env.FIXTURES_BASE_URL ?? 'https://builds.garudalinux.org/misc/fixtures'}.`,
      );
    }
    const actual = await sha256Of(dest);
    if (actual !== pkg.sha256) {
      throw new Error(
        `Fixture ${pkg.filename} checksum mismatch (expected ${pkg.sha256}, got ${actual}). ` +
          `Delete it and run 'pnpm fixtures:fetch' to re-download.`,
      );
    }
    paths.set(pkg.key, dest);
  }

  return { paths, packages: manifest.packages };
}
