import { describe, it, expect } from 'vitest';
import { buildAnalysis, derivePluginOf } from './signal/plugin';

describe('Compiled Code Detection Integration', () => {
  it('buildAnalysis correctly identifies packages with compiled code', () => {
    // Test case: package with compiled code (has provided sonames)
    const compiledAnalysis = buildAnalysis({
      version: '1.0.0',
      fileList: 'usr/lib/libfoo.so.1\nusr/bin/foo',
      readelfByFile: new Map([
        [
          'usr/lib/libfoo.so.1',
          `  Dynamic section at offset 0x2e28 contains 24 entries:
  Tag        Type                         Name/Value
 0x0000000000000001 (NEEDED)                     Shared library: [libc.so.6]
 0x000000000000000e (SONAME)                     Library soname: [libfoo.so.1]
`,
        ],
      ]),
      importsByFile: new Map([
        [
          'usr/lib/libfoo.so.1',
          `                 U __libc_start_main@@GLIBC_2.2.5
`,
        ],
      ]),
      exportsByFile: new Map([
        [
          'usr/lib/libfoo.so.1',
          `foo:
`,
        ],
      ]),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });

    expect(compiledAnalysis.providedSonames.length).toBeGreaterThan(0);
    expect(compiledAnalysis.neededSonames.length).toBeGreaterThan(0);
    expect(compiledAnalysis.providedSonames).toContain('libfoo.so.1');
    expect(compiledAnalysis.neededSonames).toContain('libc.so.6');

    const hasCompiledCode = compiledAnalysis.providedSonames.length > 0 || compiledAnalysis.neededSonames.length > 0;
    expect(hasCompiledCode).toBe(true);
  });

  it('buildAnalysis correctly identifies packages without compiled code', () => {
    // Test case: package with no compiled code (only scripts/config)
    const nonCompiledAnalysis = buildAnalysis({
      version: '1.0.0',
      fileList: 'usr/share/bash-completion/foo\nusr/share/doc/foo/README\netc/foo.conf',
      readelfByFile: new Map(),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });

    expect(nonCompiledAnalysis.providedSonames.length).toBe(0);
    expect(nonCompiledAnalysis.neededSonames.length).toBe(0);

    const hasCompiledCode =
      nonCompiledAnalysis.providedSonames.length > 0 || nonCompiledAnalysis.neededSonames.length > 0;
    expect(hasCompiledCode).toBe(false);
  });

  it('derivePluginOf returns empty array for packages without compiled code', () => {
    const files = ['usr/share/bash-completion/foo', 'usr/share/doc/foo/README'];
    const index = {
      direct: new Map([['usr/share/bash-completion', ['a123']]]),
      ancestors: new Map([['usr/share/bash-completion', ['a123']]]),
      keyToPkgname: new Map([['a123', 'bash']]),
      keyToFiles: new Map(),
    };

    const plugins = derivePluginOf(files, index, { hasCompiledCode: false });
    expect(plugins).toEqual([]);
  });

  it('derivePluginOf works normally for packages with compiled code', () => {
    const files = ['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so'];
    const index = {
      direct: new Map([['usr/lib/qt6/plugins/kwin/effects/plugins', ['a456']]]),
      ancestors: new Map([['usr/lib/qt6/plugins/kwin', ['a456']]]),
      keyToPkgname: new Map([['a456', 'kwin']]),
      keyToFiles: new Map(),
    };

    const plugins = derivePluginOf(files, index, { hasCompiledCode: true });
    expect(plugins).toEqual(['a456']);
  });

  it('real-world: GNOME Shell extensions are correctly identified as non-compiled', () => {
    const gnomeShellFiles =
      'usr/share/gnome-shell/extensions/pomodoro@arunarya.id/metadata.json\nusr/share/gnome-shell/extensions/pomodoro@arunarya.id/extension.js\nusr/share/gnome-shell/extensions/pomodoro@arunarya.id/prefs.js\nusr/share/gnome-shell/extensions/pomodoro@arunarya.id/stylesheet.css';

    const gnomeShellAnalysis = buildAnalysis({
      version: '1.0.0',
      fileList: gnomeShellFiles,
      readelfByFile: new Map(),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });

    expect(gnomeShellAnalysis.providedSonames.length).toBe(0);
    expect(gnomeShellAnalysis.neededSonames.length).toBe(0);

    const hasCompiledCode =
      gnomeShellAnalysis.providedSonames.length > 0 || gnomeShellAnalysis.neededSonames.length > 0;
    expect(hasCompiledCode).toBe(false);
  });

  it('real-world: KWin plugins are correctly identified as compiled', () => {
    const kwinPluginFiles = 'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so';

    const kwinPluginAnalysis = buildAnalysis({
      version: '1.0.0',
      fileList: kwinPluginFiles,
      readelfByFile: new Map([
        [
          'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so',
          `  Dynamic section at offset 0x2e28 contains 28 entries:
  Tag        Type                         Name/Value
 0x0000000000000001 (NEEDED)                     Shared library: [libKF5WindowSystem.so.5]
 0x0000000000000001 (NEEDED)                     Shared library: [libQt5Core.so.5]
 0x000000000000000e (SONAME)                     Library soname: [better_blur_dx.so]
`,
        ],
      ]),
      importsByFile: new Map([
        [
          'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so',
          `                 U _ZN6KConfig11sharedConfigEv
                 U _ZN7QObject17metaObjectEv.constprop
`,
        ],
      ]),
      exportsByFile: new Map([
        [
          'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so',
          `                 T _ZN12KWinEffects8registerEv
                 T _ZN14BlurEffectPlugin13createConfigEv
`,
        ],
      ]),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });

    expect(kwinPluginAnalysis.providedSonames.length).toBeGreaterThan(0);
    expect(kwinPluginAnalysis.neededSonames.length).toBeGreaterThan(0);

    const hasCompiledCode =
      kwinPluginAnalysis.providedSonames.length > 0 || kwinPluginAnalysis.neededSonames.length > 0;
    expect(hasCompiledCode).toBe(true);
  });
});
