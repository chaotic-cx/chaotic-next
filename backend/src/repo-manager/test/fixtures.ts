import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

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
  return require(join(FIXTURES_DIR, 'packages.json')) as Manifest;
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
      throw new Error(`Missing vendored fixture ${pkg.filename}. It must be checked out via git-lfs (git lfs pull).`);
    }
    const actual = await sha256Of(dest);
    if (actual !== pkg.sha256) {
      throw new Error(
        `Fixture ${pkg.filename} checksum mismatch (expected ${pkg.sha256}, got ${actual}). ` +
          `Run 'git lfs pull' to restore the real package from LFS.`,
      );
    }
    paths.set(pkg.key, dest);
  }

  return { paths, packages: manifest.packages };
}
