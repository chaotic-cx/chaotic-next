import { describe, expect, it } from 'vitest';
import { PROVENANCE_RULES } from './provenance.rules';
import { makeChange, ruleById } from './test-support';

describe('provenance rules', () => {
  it('flags VCS sources outside reputable forges', () => {
    const change = makeChange(
      [
        '@@ -10,7 +10,8 @@ pkgver=1.0',
        ' url="https://example.org/project/"',
        ' source=(',
        '+  "git+https://git.somewhere-odd.example/payload.git"',
        '   "https://example.org/release.tar.gz"',
        ' )',
      ].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-001').check(change)?.note).toContain('git.somewhere-odd.example');
  });

  it('accepts reputable git sources with an unrelated url=', () => {
    const change = makeChange(
      [
        '@@ -10,7 +10,8 @@ pkgver=1.0',
        ' url="https://example.org/project/"',
        ' source=(',
        '+  "git+https://github.com/upstream/project.git"',
        ' )',
      ].join('\n'),
    );
    expect(PROVENANCE_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });

  it('flags sources on generic file hosts', () => {
    const change = makeChange(
      ['@@ -10,7 +10,8 @@', ' source=(', '+  "https://cdn.example.netlify.app/payload"', ' )'].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-002').check(change)).not.toBeNull();
  });

  it('flags source hosts unrelated to the url= upstream (CHAOS-RAT pattern)', () => {
    const change = makeChange(
      [
        '@@ -12,6 +12,7 @@',
        ' url="https://kde.org/applications/"',
        ' source=(',
        '+  "https://some-personal-site.example/fix.patch"',
        '   "https://download.kde.org/stable/app/1.0.tar.xz"',
        ' )',
      ].join('\n'),
    );
    const hit = ruleById(PROVENANCE_RULES, 'SRC-003').check(change);
    expect(hit).not.toBeNull();
    expect(hit?.line).toBe(14);
  });

  it('reports the line of a variable-resolved source entry', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,5 @@',
        '+pkgver=1.0',
        '+_gentoo=firefox-154-patches-01.tar.xz',
        '+url="https://gitlab.com/upstream/pkg"',
        '+source=("https://dev.gentoo.org/~someone/mozilla/patchsets/$_gentoo")',
      ].join('\n'),
    );
    const hit = ruleById(PROVENANCE_RULES, 'SRC-003').check(change);
    expect(hit?.line).toBe(4);
  });

  it('does not compare against url= when the diff does not show it', () => {
    const change = makeChange(
      ['@@ -50,3 +50,4 @@', ' source=(', '+  "https://some-personal-site.example/fix.patch"', ' )'].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-003').check(change)).toBeNull();
  });

  it('ignores source-like arrays outside PKGBUILDs', () => {
    const change = makeChange(
      ['@@ -1,2 +1,3 @@', ' url="https://example.org/"', '+source=("https://cdn.example.netlify.app/payload")'].join(
        '\n',
      ),
      { new_path: 'foo/build.sh' },
    );
    expect(PROVENANCE_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });
});
