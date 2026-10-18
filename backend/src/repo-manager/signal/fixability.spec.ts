import { describe, expect, it } from 'vitest';
import { classifyBrokenDependency, hasSuccessor, sonameStems, worstFixability } from './fixability';
import { type BrokenDependency } from './graph';

const stems = sonameStems(['libjsoncpp.so.27', 'libsoup-3.0.so.0', 'libImageMagick.so']);

function soname(name: string): BrokenDependency {
  return { kind: 'soname', soname: name };
}

describe('sonameStems', () => {
  it('drops the version suffix of each soname', () => {
    expect([...stems]).toEqual(['libjsoncpp.so', 'libsoup-3.0.so', 'libImageMagick.so']);
  });
});

describe('hasSuccessor', () => {
  it('finds another version of the same library', () => {
    expect(hasSuccessor(soname('libjsoncpp.so.26'), stems)).toBe(true);
  });

  it('finds no successor when the library family is gone', () => {
    expect(hasSuccessor(soname('libsoup-2.4.so.1'), stems)).toBe(false);
  });

  it('finds a Haskell library with another version hash', () => {
    const haskellStems = sonameStems(['libHSsyb-0.7.4-COKSG-ghc9.6.7.so']);

    expect(hasSuccessor(soname('libHSsyb-0.7.4-6GzGX-ghc9.6.7.so'), haskellStems)).toBe(true);
    expect(hasSuccessor(soname('libHSaeson-2.2.3-Ab12C-ghc9.6.7.so'), haskellStems)).toBe(false);
  });

  it('finds no successor for an unversioned soname that nobody ships', () => {
    expect(hasSuccessor(soname('libImageProcessor.so'), stems)).toBe(false);
  });

  it('always resolves a stale runtime directory', () => {
    const dep: BrokenDependency = { kind: 'runtime', runtime: 'python', currentVersion: '3.13', pathVersion: '3.12' };

    expect(hasSuccessor(dep, stems)).toBe(true);
  });

  it('always resolves a re-versioned symbol', () => {
    const dep: BrokenDependency = { kind: 'version', soname: 'libonnxruntime.so.1', versionNodes: ['VERS_1.28.0'] };

    expect(hasSuccessor(dep, stems)).toBe(true);
  });
});

describe('classifyBrokenDependency', () => {
  const noneAsBuilt = new Set<string>();

  it('fixes a missing soname with a successor by a rebuild', () => {
    const issue = classifyBrokenDependency(soname('libjsoncpp.so.26'), {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: true,
    });

    expect(issue).toEqual({ reason: 'missing soname libjsoncpp.so.26', fixability: 'rebuild' });
  });

  it('has no fix for a prebuilt package with a missing soname that has a successor', () => {
    const issue = classifyBrokenDependency(soname('libjsoncpp.so.26'), {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: false,
    });

    expect(issue.fixability).toBe('noFix');
  });

  it('has no fix for a prebuilt package with a re-versioned symbol', () => {
    const dep: BrokenDependency = { kind: 'version', soname: 'libonnxruntime.so.1', versionNodes: ['VERS_1.28.0'] };
    const issue = classifyBrokenDependency(dep, {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: false,
    });

    expect(issue.fixability).toBe('noFix');
  });

  it('has no fix for a foreign libc in a source package', () => {
    const issue = classifyBrokenDependency(soname('libc.so.8'), {
      sonameStems: sonameStems(['libc.so.6']),
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: true,
    });

    expect(issue.fixability).toBe('noFix');
  });

  it('has no fix for the Solaris libkstat', () => {
    const issue = classifyBrokenDependency(soname('libkstat.so.1'), {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: true,
    });

    expect(issue.fixability).toBe('noFix');
  });

  it('fixes a stale runtime directory of a prebuilt package by a rebuild', () => {
    const dep: BrokenDependency = { kind: 'runtime', runtime: 'python', currentVersion: '3.13', pathVersion: '3.12' };
    const issue = classifyBrokenDependency(dep, {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: false,
    });

    expect(issue.fixability).toBe('rebuild');
  });

  it('needs a PKGBUILD change for a source package whose library family is gone', () => {
    const issue = classifyBrokenDependency(soname('libsoup-2.4.so.1'), {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: true,
    });

    expect(issue.fixability).toBe('pkgbuildChange');
  });

  it('has no fix for a prebuilt package whose library family is gone', () => {
    const issue = classifyBrokenDependency(soname('libsoup-2.4.so.1'), {
      sonameStems: stems,
      reasonsAsBuilt: noneAsBuilt,
      isSourceCompiled: false,
    });

    expect(issue.fixability).toBe('noFix');
  });

  it('does not expect a rebuild to fix a reason that survived the build', () => {
    const issue = classifyBrokenDependency(soname('libjsoncpp.so.26'), {
      sonameStems: stems,
      reasonsAsBuilt: new Set(['missing soname libjsoncpp.so.26']),
      isSourceCompiled: true,
    });

    expect(issue.fixability).toBe('pkgbuildChange');
  });
});

describe('worstFixability', () => {
  it('picks the worst reason', () => {
    const worst = worstFixability([
      { reason: 'a', fixability: 'rebuild' },
      { reason: 'b', fixability: 'noFix' },
      { reason: 'c', fixability: 'pkgbuildChange' },
    ]);

    expect(worst).toBe('noFix');
  });

  it('counts a package without issues as fixable by a rebuild', () => {
    expect(worstFixability([])).toBe('rebuild');
  });
});
