import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { describe, expect, it } from 'vitest';
import { parsePkgbuild } from './pkgbuild';
import { NETWORK_RULES } from './rules/network.rules';
import { PROVENANCE_RULES } from './rules/provenance.rules';
import { ruleById, addedOnlyDiff, makeChange } from './rules/test-support';
import { srcinfoConsistencyHits } from './rules/srcinfo-consistency.rules';

/**
 * Regression fixtures: real PKGBUILDs pulled from the AUR and from
 * chaotic-aur/pkgbuilds. They pin parser behavior against live packaging
 * idioms that previously produced false positives (floorp, litehtml0.9,
 * shelly, linux-cachyos). Refresh them by re-downloading the files when a
 * package moves on.
 */
const FIXTURE_ROOT = join(import.meta.dirname, '__fixtures__', 'aur');

function loadFixture(pkg: string, file: string): string {
  return readFileSync(join(FIXTURE_ROOT, pkg, file), 'utf-8');
}

/** Mirrors the full-file diffs the aur-scan service builds from repo files. */
function scannedPackage(pkg: string, files: string[]): MergeRequestDiffSchema[] {
  return files.map((file) =>
    makeChange(addedOnlyDiff(loadFixture(pkg, file).split('\n')), {
      new_path: `${pkg}/${file}`,
      old_path: `${pkg}/${file}`,
      new_file: true,
    }),
  );
}

describe('real-world AUR fixtures', () => {
  describe('floorp', () => {
    const changes = scannedPackage('floorp', ['PKGBUILD', '.SRCINFO']);

    it('does not report a SRCINFO mismatch for option-dependent depends/makedepends', () => {
      expect(srcinfoConsistencyHits(changes)).toEqual([]);
    });

    it('resolves all source entries including ${_runtime_commit::7}', () => {
      const parsed = parsePkgbuild(changes[0] as MergeRequestDiffSchema);
      const entries = parsed?.entries ?? [];
      const raw = entries.map((entry) => entry.raw);

      expect(raw).toEqual([
        'floorp-components-12.17.0.tar.gz::https://github.com/Floorp-Projects/Floorp/archive/refs/tags/v12.17.0.tar.gz',
        'floorp-runtime-fee6311.tar.gz::https://github.com/Floorp-Projects/Floorp-Runtime/archive/fee63112daf6ca7130c71997ce56fe381cdffcca.tar.gz',
        'floorp-projects.floorp-core::git+https://github.com/Floorp-Projects/Floorp-core.git',
        'floorp.desktop',
        '0001-fix-rust-1.98-targets.patch',
      ]);
      expect(entries.slice(0, 3).map((entry) => entry.host)).toEqual(['github.com', 'github.com', 'github.com']);
    });

    it('stays silent on provenance findings', () => {
      for (const rule of PROVENANCE_RULES) {
        expect(rule.check(changes[0] as MergeRequestDiffSchema)).toBeNull();
      }
    });
  });

  describe('shelly', () => {
    const changes = scannedPackage('shelly', ['PKGBUILD', '.SRCINFO']);

    it('resolves sources referencing the pkgname array', () => {
      const parsed = parsePkgbuild(changes[0] as MergeRequestDiffSchema);
      expect(parsed?.entries[0]?.raw).toBe(
        'shelly-3.0.6.tar.gz::https://github.com/Seafoam-Labs/Shelly-ALPM/archive/v3.0.6.tar.gz',
      );
      expect(parsed?.entries[0]?.host).toBe('github.com');
    });

    it('does not report unresolvable sources or SRCINFO mismatches', () => {
      expect(
        ruleById(PROVENANCE_RULES, 'CAUR-UNRESOLVED-SOURCE').check(changes[0] as MergeRequestDiffSchema),
      ).toBeNull();
      expect(srcinfoConsistencyHits(changes)).toEqual([]);
    });
  });

  describe('litehtml0.9', () => {
    const changes = scannedPackage('litehtml0.9', ['PKGBUILD']);

    it('does not flag the plain-http url= homepage as unencrypted source', () => {
      expect(ruleById(NETWORK_RULES, 'NET-001').check(changes[0] as MergeRequestDiffSchema)).toBeNull();
    });

    it('keeps treating an http source= entry as a finding', () => {
      const withHttpSource = makeChange(
        addedOnlyDiff(["url='http://www.example.com/'", 'source=("http://files.example/pkg.tar.gz")']),
      );
      expect(ruleById(NETWORK_RULES, 'NET-001').check(withHttpSource)?.match).toContain('http://files.example');
    });

    it('does not flag provenance for its github sources', () => {
      for (const rule of PROVENANCE_RULES) {
        expect(rule.check(changes[0] as MergeRequestDiffSchema)).toBeNull();
      }
    });
  });

  describe('freeipa', () => {
    const changes = scannedPackage('freeipa', ['PKGBUILD', '.SRCINFO']);

    it('resolves sources using ${pkgver//./-} pattern replacement', () => {
      const parsed = parsePkgbuild(changes[0] as MergeRequestDiffSchema);

      expect(parsed?.entries.map((entry) => entry.raw)).toEqual([
        'https://codeberg.org/freeipa/freeipa/releases/download/release-4-13-3/freeipa-4.13.3.tar.gz{,.asc}',
        'nis-domainname.service',
        'ipaplatform.tar.gz',
      ]);
      expect(parsed?.entries[0]?.host).toBe('codeberg.org');
    });

    it('does not report unresolvable sources or SRCINFO source drift', () => {
      expect(
        ruleById(PROVENANCE_RULES, 'CAUR-UNRESOLVED-SOURCE').check(changes[0] as MergeRequestDiffSchema),
      ).toBeNull();
      expect(srcinfoConsistencyHits(changes)).toEqual([]);
    });
  });

  describe('linux-cachyos', () => {
    const changes = scannedPackage('linux-cachyos', ['PKGBUILD']);

    it('parses sources defined after helper functions and conditional blocks', () => {
      const parsed = parsePkgbuild(changes[0] as MergeRequestDiffSchema);
      const entries = parsed?.entries ?? [];

      expect(entries.map((entry) => entry.raw)).toEqual([
        'https://github.com/CachyOS/linux/releases/download/cachyos-7.2.0-1/cachyos-7.2.0-1.tar.gz{,.asc}',
        'config',
      ]);
      expect(entries[0]?.host).toBe('github.com');
    });

    it('does not report unresolvable sources', () => {
      expect(
        ruleById(PROVENANCE_RULES, 'CAUR-UNRESOLVED-SOURCE').check(changes[0] as MergeRequestDiffSchema),
      ).toBeNull();
    });
  });
});
