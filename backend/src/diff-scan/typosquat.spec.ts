import type { Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import type { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { addedOnlyDiff, makeChange } from './rules/test-support';
import { closestKnownName, findTyposquatFinding, normalizePackageName } from './typosquat';

const KNOWN_NAMES = new Set(['google-chrome', 'firefox', 'linux-zen']);

function stubRepo(rows: { pkgname: string }[]): Repository<ArchlinuxPackage> {
  return { find: async () => rows } as unknown as Repository<ArchlinuxPackage>;
}

function pkgbuildChange(pkgname: string) {
  return makeChange(addedOnlyDiff([`pkgname=${pkgname}`, 'pkgver=1.0']));
}

describe('normalizePackageName', () => {
  it('strips variant markers', () => {
    expect(normalizePackageName('google-chrome-bin')).toBe('google-chrome');
    expect(normalizePackageName('firefox-git')).toBe('firefox');
    expect(normalizePackageName('lib32-mesa-git')).toBe('mesa');
  });
});

describe('closestKnownName', () => {
  it('flags near-identical names', () => {
    expect(closestKnownName('goggle-chrome', KNOWN_NAMES)).toEqual({ knownName: 'google-chrome', distance: 1 });
  });

  it('ignores exact names and ordinary variants', () => {
    expect(closestKnownName('google-chrome', KNOWN_NAMES)).toBeNull();
    expect(closestKnownName('google-chrome-git', KNOWN_NAMES)).toBeNull();
    expect(closestKnownName('lib32-google-chrome', KNOWN_NAMES)).toBeNull();
  });

  it('ignores unrelated names', () => {
    expect(closestKnownName('my-personal-toolbox', KNOWN_NAMES)).toBeNull();
  });
});

describe('findTyposquatFinding', () => {
  it('reports an impersonating pkgname against known Arch packages', async () => {
    const finding = await findTyposquatFinding(
      pkgbuildChange('goggle-chrome'),
      stubRepo([{ pkgname: 'google-chrome' }]),
    );
    expect(finding?.ruleId).toBe('CAUR-TYPOSQUAT-NAME');
    expect(finding?.severity).toBe('warning');
    expect(finding?.description).toContain('google-chrome');
  });

  it('passes legitimate packages through', async () => {
    const repo = stubRepo([{ pkgname: 'google-chrome' }, { pkgname: 'firefox' }]);
    await findTyposquatFinding(pkgbuildChange('goggle-chrome'), repo);
    expect(await findTyposquatFinding(pkgbuildChange('totally-unrelated'), repo)).toBeNull();
  });

  it('skips scans without a package repository', async () => {
    expect(await findTyposquatFinding(pkgbuildChange('goggle-chrome'))).toBeNull();
  });

  it('skips changes without a readable pkgname', async () => {
    const change = makeChange(addedOnlyDiff(['echo hello']));
    expect(await findTyposquatFinding(change, stubRepo([{ pkgname: 'firefox' }]))).toBeNull();
  });
});
