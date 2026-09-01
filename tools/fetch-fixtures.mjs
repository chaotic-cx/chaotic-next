#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend/src/repo-manager/__fixtures__');
const BASE_URL = process.env.FIXTURES_BASE_URL ?? 'https://builds.garudalinux.org/misc/fixtures';

async function sha256Of(path) {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

async function fetchOne(pkg) {
  const dest = join(FIXTURES_DIR, pkg.filename);
  if (existsSync(dest)) {
    const actual = await sha256Of(dest);
    if (actual === pkg.sha256) {
      console.log(`ok  ${pkg.filename}`);
      return;
    }
    console.log(
      `hash mismatch ${pkg.filename} (expected ${pkg.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…), re-fetching`,
    );
  }
  const url = `${BASE_URL}/${encodeURIComponent(pkg.filename)}`;
  console.log(`fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== pkg.sha256)
    throw new Error(`checksum mismatch for ${pkg.filename}: expected ${pkg.sha256}, got ${actual}`);
  mkdirSync(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`wrote ${pkg.filename} (${(buf.length / 1024).toFixed(0)} KiB)`);
}

const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, 'packages.json'), 'utf-8'));
for (const pkg of manifest.packages) await fetchOne(pkg);
console.log('done');
