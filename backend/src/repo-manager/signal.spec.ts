import { describe, expect, it } from 'vitest';
import type { RelocationEntry } from './signal';
import {
  buildAnalysis,
  buildDependencyGraph,
  classifyVtableDrift,
  dedupe,
  deriveDirectoriesOwned,
  derivePluginOf,
  extractVtableSlots,
  findBrokenDependencies,
  findSymbolBreaks,
  findVtableBreaks,
  findVtableDrifts,
  formatBrokenDependency,
  formatConsumerAbiBreak,
  formatSymbolBreak,
  compareArchVersions,
  isElfSharedObject,
  isExecutableRegularFile,
  latestAnalysisByKey,
  libraryBaseName,
  parseDefinedSymbols,
  parseFileList,
  parseNmSymbolsWithSize,
  parseReadelfDynamic,
  parseReadelfRelocations,
  parseTarVerboseList,
  parseUndefinedSymbols,
  parentDirectory,
  sameLibraryFamily,
} from './signal';

const READELF_BLUR = `
Dynamic section at offset 0x28388 contains 35 entries:
  Tag        Type                         Name/Value
 0x0000000000000001 (NEEDED)             Shared library: [libkwin.so.6]
 0x0000000000000001 (NEEDED)             Shared library: [libxcb.so.1]
 0x0000000000000001 (NEEDED)             Shared library: [libepoxy.so.0]
 0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]
 0x000000000000000e (SONAME)             Library soname: [libbetter_blur_dx.so]
`;

const NM_UNDEF = `
                 U __cxa_atexit@GLIBC_2.2.5
                 w __cxa_finalize@GLIBC_2.2.5
                 U _ZN4KWin10RenderView16staticMetaObjectE
                 U _ZN4KWin12BorderRadiusC1Ed
                 V foo_weak_versioned@CXXABI_1.3
`;

const NM_DEFINED = `
000000000063e620 T _Z21executablePathFromPidi
0000000000a0b3c8 B _ZGVZN9QMetaType21registerConverterImplEv
00000000009c5dc0 D _ZN4KWin10RenderView16staticMetaObjectE
00000000009c5dc1 D _ZN4KWin12BorderRadiusC1Ed
`;

describe('parseFileList', () => {
  it('drops directories and blank lines', () => {
    expect(parseFileList('usr/lib/libkwin.so.6\nusr/lib/qt6/plugins/kwin/\n\nusr/bin/kwin\n')).toEqual([
      'usr/lib/libkwin.so.6',
      'usr/bin/kwin',
    ]);
  });
});

describe('parseReadelfDynamic', () => {
  it('extracts NEEDED and SONAME', () => {
    const { needed, soname } = parseReadelfDynamic(READELF_BLUR);
    expect(needed).toEqual(['libkwin.so.6', 'libxcb.so.1', 'libepoxy.so.0', 'libc.so.6']);
    expect(soname).toBe('libbetter_blur_dx.so');
  });
});

describe('parseUndefinedSymbols', () => {
  it('parses nm -D --undefined-only and strips @version suffixes', () => {
    expect(parseUndefinedSymbols(NM_UNDEF)).toEqual([
      '__cxa_atexit',
      '__cxa_finalize',
      '_ZN4KWin10RenderView16staticMetaObjectE',
      '_ZN4KWin12BorderRadiusC1Ed',
      'foo_weak_versioned',
    ]);
  });
});

describe('parseDefinedSymbols', () => {
  it('parses nm -D --defined-only', () => {
    expect(parseDefinedSymbols(NM_DEFINED)).toEqual([
      '_Z21executablePathFromPidi',
      '_ZGVZN9QMetaType21registerConverterImplEv',
      '_ZN4KWin10RenderView16staticMetaObjectE',
      '_ZN4KWin12BorderRadiusC1Ed',
    ]);
  });
});

describe('isElfSharedObject / parentDirectory', () => {
  it('identifies .so files and their parents', () => {
    expect(isElfSharedObject('usr/lib/libkwin.so.6')).toBe(true);
    expect(isElfSharedObject('usr/lib/libkwin.so.6.7.4')).toBe(true);
    expect(isElfSharedObject('usr/lib/libfoo.so')).toBe(true);
    expect(isElfSharedObject('usr/bin/kwin')).toBe(false);
    expect(parentDirectory('usr/lib/libkwin.so.6')).toBe('usr/lib');
    expect(parentDirectory('libkwin.so.6')).toBeNull();
  });
});

describe('deriveDirectoriesOwned', () => {
  it('collects every ancestor of every file', () => {
    expect(deriveDirectoriesOwned(['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so'])).toEqual([
      'usr',
      'usr/lib',
      'usr/lib/qt6',
      'usr/lib/qt6/plugins',
      'usr/lib/qt6/plugins/kwin',
      'usr/lib/qt6/plugins/kwin/effects',
      'usr/lib/qt6/plugins/kwin/effects/plugins',
    ]);
  });
});

describe('derivePluginOf', () => {
  const mk = (entries: Record<string, string[]>) => new Map(Object.entries(entries));
  // kwin is Arch package #42 -> owner key "a42".
  const KWIN = 'a42';
  const names = new Map<string, string>([[KWIN, 'kwin']]);

  it('flags a consumer writing into a really-owned directory (exact parent)', () => {
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN] });
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so'],
      {
        direct,
        ancestors: direct,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([KWIN]);
  });

  it('flags a consumer living in an owner-named plugin namespace (real kwin case)', () => {
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN] });
    const ancestors = mk({
      'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN],
      'usr/lib/qt6/plugins/kwin/effects': [KWIN],
      'usr/lib/qt6/plugins/kwin': [KWIN],
    });
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so'],
      {
        direct,
        ancestors,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([KWIN]);
  });

  it('flags a consumer matched only by the ancestor-segment rule (no direct ownership)', () => {
    // better-blur's main .so sits in effects/plugins/, which kwin does NOT own
    // directly. Detection relies solely on the ancestor usr/lib/qt6/plugins/kwin
    // whose path names kwin as a segment. This is the case that was dead before
    // the keyToPkgname resolver was wired through.
    const direct = mk({});
    const ancestors = mk({ 'usr/lib/qt6/plugins/kwin': [KWIN] });
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so'],
      {
        direct,
        ancestors,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([KWIN]);
  });

  it('does not flag an owner whose pkgname is not a path segment', () => {
    // Owner owns the ancestor tree, but the owner's pkgname never appears as a
    // segment -> rule 2 must not fire. (Without the resolver, the encoded key
    // also never matched; this pins the intended behaviour.)
    const direct = mk({});
    const ancestors = mk({ 'usr/lib/someapp': [KWIN] });
    const namesNoKwin = new Map<string, string>([[KWIN, 'kwin']]);
    const plugins = derivePluginOf(
      ['usr/lib/someapp/plugins/whatever.so'],
      {
        direct,
        ancestors,
        keyToPkgname: namesNoKwin,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([]);
  });

  it('flags both files of the real better-blur package', () => {
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN] });
    const ancestors = mk({
      'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN],
      'usr/lib/qt6/plugins/kwin/effects': [KWIN],
      'usr/lib/qt6/plugins/kwin': [KWIN],
    });
    const plugins = derivePluginOf(
      [
        'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so',
        'usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so',
      ],
      { direct, ancestors, keyToPkgname: names, keyToFiles: new Map() },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([KWIN]);
  });

  it('ignores files not in any owned directory', () => {
    expect(
      derivePluginOf(
        ['usr/bin/foo'],
        { direct: new Map(), ancestors: new Map(), keyToPkgname: new Map(), keyToFiles: new Map() },
        { hasCompiledCode: false },
      ),
    ).toEqual([]);
  });

  it('does not flag a package merely shipping under a generic shared dir', () => {
    const direct = mk({});
    const ancestors = mk({ 'usr/lib': [KWIN], 'usr/lib/x86_64-linux-gnu': [KWIN] });
    const plugins = derivePluginOf(
      ['usr/lib/x86_64-linux-gnu/libfoo.so.1'],
      {
        direct,
        ancestors,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([]);
  });

  it('skips generic ancestor dirs regardless of how many owners list them', () => {
    // `usr`, `usr/lib` and `usr/share` are owned by (essentially) every package,
    // so the ancestor rule must short-circuit on GENERIC_DIRS instead of walking
    // every owner of those dirs for every shipped file. Otherwise the derive loop
    // degrades to O(files x total packages). A plugin named `kwin` still matches
    // via its real namespace dir, not via the generic ones.
    const direct = mk({});
    const ancestors = mk({
      'usr': [KWIN],
      'usr/lib': [KWIN],
      'usr/share': [KWIN],
      'usr/lib/qt6/plugins/kwin': [KWIN],
    });
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so'],
      {
        direct,
        ancestors,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([KWIN]);
  });

  it('returns empty array for packages without compiled code', () => {
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN] });
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so'],
      {
        direct,
        ancestors: direct,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: false },
    );
    expect(plugins).toEqual([]);
  });

  it('allows plugin detection for packages with compiled code', () => {
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN] });
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so'],
      {
        direct,
        ancestors: direct,
        keyToPkgname: names,
        keyToFiles: new Map(),
      },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([KWIN]);
  });

  it('does not flag a package sharing a widely-owned namespace dir (icon/apps false positive)', () => {
    // fooyin owns usr/share/icons/hicolor/scalable/apps, but so do ~900 other
    // apps. yacreader installing its icon there must NOT become a "plugin of"
    // fooyin — that produced 700+ bogus plugin ABI breaks. A real plugin dir is
    // owned by a handful of packages, far below this shared namespace.
    const direct = mk({
      'usr/share/icons/hicolor/scalable/apps': Array.from({ length: 900 }, (ignored, i) => `a${i}`),
    });
    const plugins = derivePluginOf(
      ['usr/share/icons/hicolor/scalable/apps/yacreader.svg'],
      { direct, ancestors: new Map(), keyToPkgname: new Map(), keyToFiles: new Map() },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual([]);
  });

  it('still flags a real plugin dir owned by a handful of packages', () => {
    const direct = mk({ 'usr/lib/fooyin/plugins': ['c1'] });
    const plugins = derivePluginOf(
      ['usr/lib/fooyin/plugins/foo.so'],
      { direct, ancestors: new Map(), keyToPkgname: new Map([['c1', 'fooyin']]), keyToFiles: new Map() },
      { hasCompiledCode: true },
    );
    expect(plugins).toEqual(['c1']);
  });

  it('does not treat a build variant as a plugin of the base package', () => {
    // fooyin-git (Chaotic, built from master) installs into usr/lib/fooyin/
    // plugins, which fooyin (Arch, stable) also owns. Same upstream package,
    // so fooyin must NOT appear in fooyin-git's pluginOf — a stable-version
    // vtable drift never requires rebuilding the -git build.
    const direct = mk({
      'usr/lib/fooyin/plugins': ['a16430', 'c9'],
    });
    const names = new Map<string, string>([
      ['a16430', 'fooyin'],
      ['c9', 'fooyin-git'],
    ]);
    const plugins = derivePluginOf(
      ['usr/lib/fooyin/plugins/foo.so'],
      { direct, ancestors: new Map(), keyToPkgname: names, keyToFiles: new Map() },
      { consumerPkgname: 'fooyin-git', hasCompiledCode: true },
    );
    expect(plugins).toEqual([]);
  });

  it('keeps a genuinely external owner even when a same-family owner also matches', () => {
    // fooyin-git installs a .so into both its own namespace and an external
    // host's plugin dir. The same-family owner is dropped, the external host stays.
    const direct = mk({
      'usr/lib/fooyin/plugins': ['a16430', 'c9'],
      'usr/lib/kwin/effects/plugins': ['a42'],
    });
    const names = new Map<string, string>([
      ['a16430', 'fooyin'],
      ['c9', 'fooyin-git'],
      ['a42', 'kwin'],
    ]);
    const plugins = derivePluginOf(
      ['usr/lib/fooyin/plugins/foo.so', 'usr/lib/kwin/effects/plugins/foo.so'],
      { direct, ancestors: new Map(), keyToPkgname: names, keyToFiles: new Map() },
      { consumerPkgname: 'fooyin-git', hasCompiledCode: true },
    );
    expect(plugins).toEqual(['a42']);
  });

  it('does not treat a fork that shadows the owner as a plugin', () => {
    // ungoogled-chromium-bin installs into chromium's own namespace AND ships
    // files at the same paths chromium ships (usr/lib/chromium/...). It shadows
    // chromium, so it is a fork, not a plugin of it.
    const direct = mk({ 'usr/lib/chromium': ['a1118'] });
    const keyToFiles = new Map<string, Set<string>>([
      ['a1118', new Set(['usr/lib/chromium/chrome', 'usr/lib/chromium/v8_context_snapshot.bin'])],
    ]);
    const plugins = derivePluginOf(
      ['usr/lib/chromium/chrome', 'usr/lib/chromium/v8_context_snapshot.bin', 'usr/lib/chromium/locales/en.pak'],
      { direct, ancestors: new Map(), keyToPkgname: new Map([['a1118', 'chromium']]), keyToFiles },
      { consumerPkgname: 'ungoogled-chromium-bin', hasCompiledCode: true },
    );
    expect(plugins).toEqual([]);
  });

  it('keeps a plugin that only adds files to the host namespace', () => {
    // A real kwin effect adds its own .so into kwin's dir; it shares no file
    // with kwin, so the shadow rule must not remove it.
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': ['a42'] });
    const keyToFiles = new Map<string, Set<string>>([
      ['a42', new Set(['usr/lib/qt6/plugins/kwin/effects/configs/kwin_config.so'])],
    ]);
    const plugins = derivePluginOf(
      ['usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so'],
      { direct, ancestors: new Map(), keyToPkgname: new Map([['a42', 'kwin']]), keyToFiles },
      { consumerPkgname: 'better-blur', hasCompiledCode: true },
    );
    expect(plugins).toEqual(['a42']);
  });

  it('derives no plugin owners for the real wxmaxima package (2026-08-29 bump-storm regression)', () => {
    // The real wxmaxima file list from prod. Its pre-fix pluginOf held 5,186
    // owners (kicad, deepin-file-manager, ...) from a corrupted directory
    // index, which mass-triggered false PLUGIN bumps on 2026-08-29. Against a
    // healthy index, none of these paths name another package's namespace.
    const files = [
      'usr/bin/wxmaxima',
      'usr/bin/wxmxdiff',
      'usr/share/applications/io.github.wxmaxima_developers.wxMaxima.desktop',
      'usr/share/bash-completion/completions/wxmaxima',
      'usr/share/doc/wxmaxima/README.md',
      'usr/share/doc/wxmaxima/wxmaxima.html',
      'usr/share/icons/hicolor/scalable/apps/io.github.wxmaxima_developers.wxMaxima.svg',
      'usr/share/locale/de/LC_MESSAGES/wxMaxima.mo',
      'usr/share/man/man1/wxmaxima.1.gz',
      'usr/share/metainfo/io.github.wxmaxima_developers.wxMaxima.appdata.xml',
      'usr/share/mime/packages/x-wxmathml.xml',
      'usr/share/pixmaps/wxmaxima-32.xpm',
      'usr/share/wxMaxima/io.github.wxmaxima_developers.wxMaxima.svg',
    ];
    const kicad = 'a5041';
    const deepin = 'a1490';
    const direct = mk({ 'usr/share/kicad': [kicad], 'usr/share/deepin-file-manager/tools': [deepin] });
    const ancestors = mk({
      'usr/share/kicad': [kicad],
      'usr/share/deepin-file-manager/tools': [deepin],
      'usr/share/deepin-file-manager': [deepin],
    });
    const plugins = derivePluginOf(
      files,
      {
        direct,
        ancestors,
        keyToPkgname: new Map([
          [kicad, 'kicad'],
          [deepin, 'deepin-file-manager'],
        ]),
        keyToFiles: new Map(),
      },
      { consumerPkgname: 'wxmaxima', hasCompiledCode: true },
    );
    expect(plugins).toEqual([]);
  });

  it('keeps the real kwin owner for better-blur when polluted owners push the set past the cap', () => {
    // Real better-blur files and real kwin ownership. A corrupted index adds
    // 150 stale duplicate kwin owners on kwin's real ancestor directory, the
    // shape that mass-produced phantom pluginOf entries before the fix. The
    // cap must reduce the set to the one directly-evidenced owner.
    const files = [
      'usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so',
      'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so',
    ];
    const stale = Array.from({ length: 150 }, (ignored, index) => `stale${index}`);
    const direct = mk({ 'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN] });
    const ancestors = mk({
      'usr/lib/qt6/plugins/kwin/effects/configs': [KWIN, ...stale],
      'usr/lib/qt6/plugins/kwin/effects': [KWIN, ...stale],
      'usr/lib/qt6/plugins/kwin': [KWIN],
    });
    const names = new Map<string, string>([[KWIN, 'kwin']]);
    for (const owner of stale) names.set(owner, 'kwin');
    const plugins = derivePluginOf(
      files,
      { direct, ancestors, keyToPkgname: names, keyToFiles: new Map() },
      {
        consumerPkgname: 'better-blur',
        hasCompiledCode: true,
      },
    );
    expect(plugins).toEqual([KWIN]);
  });
});

describe('buildAnalysis', () => {
  it('aggregates the full ELF signal from raw tool output', () => {
    const analysis = buildAnalysis({
      version: '2.5.1-1.5',
      fileList: ['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so', 'usr/lib/qt6/plugins/kwin/'].join('\n'),
      readelfByFile: new Map([['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so', READELF_BLUR]]),
      importsByFile: new Map([['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so', NM_UNDEF]]),
      exportsByFile: new Map([['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so', NM_DEFINED]]),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });

    expect(analysis.version).toBe('2.5.1-1.5');
    expect(analysis.files).toEqual(['usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so']);
    expect(analysis.neededSonames).toEqual(['libc.so.6', 'libepoxy.so.0', 'libkwin.so.6', 'libxcb.so.1']);
    expect(analysis.providedSonames).toEqual(['libbetter_blur_dx.so']);
    expect(analysis.importedSymbols).toContain('_ZN4KWin10RenderView16staticMetaObjectE');
    expect(analysis.importedSymbols).not.toContain('__cxa_atexit@GLIBC_2.2.5'); // version stripped
    expect(analysis.exportedSymbols['libbetter_blur_dx.so']).toContain('_Z21executablePathFromPidi');
    expect(analysis.directoriesOwned).toEqual([
      'usr',
      'usr/lib',
      'usr/lib/qt6',
      'usr/lib/qt6/plugins',
      'usr/lib/qt6/plugins/kwin',
      'usr/lib/qt6/plugins/kwin/effects',
      'usr/lib/qt6/plugins/kwin/effects/plugins',
    ]);
    expect(analysis.pluginOf).toEqual([]);
  });

  it('records the basename of a shared object that lacks a SONAME as provided', () => {
    const analysis = buildAnalysis({
      version: '8.6.14-3',
      fileList: 'usr/lib/libtcl8.6.so\nusr/lib/libtk8.6.so',
      readelfByFile: new Map([
        ['usr/lib/libtcl8.6.so', 'Dynamic section at offset 0x0 contains 0 entries:\n'],
        ['usr/lib/libtk8.6.so', 'Dynamic section at offset 0x0 contains 0 entries:\n'],
      ]),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });
    expect(analysis.providedSonames).toEqual(['libtcl8.6.so', 'libtk8.6.so']);
  });

  it('produces an empty analysis for a package without ELF objects', () => {
    const analysis = buildAnalysis({
      version: '1.0-1',
      fileList: 'usr/share/doc/foo/readme\nusr/bin/foo',
      readelfByFile: new Map(),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
    });
    expect(analysis.neededSonames).toEqual([]);
    expect(analysis.providedSonames).toEqual([]);
    expect(analysis.importedSymbols).toEqual([]);
    expect(analysis.exportedSymbols).toEqual({});
    expect(analysis.vtables).toEqual({});
  });
});

describe('findSymbolBreaks', () => {
  it('flags a symbol the consumer imports that the owner stopped exporting', () => {
    const breaks = findSymbolBreaks(
      ['_ZN4KWin10RenderView16staticMetaObjectE', 'epoxy_glBlendColor'],
      {
        'libkwin.so.6': ['_ZN4KWin10RenderView16staticMetaObjectE', 'somethingElse'],
      },
      {
        'libkwin.so.6': ['somethingElse'], // the KWin symbol disappeared
      },
    );
    expect(breaks).toEqual([{ symbol: '_ZN4KWin10RenderView16staticMetaObjectE', soname: 'libkwin.so.6' }]);
  });

  it('produces no break when all imported symbols survive', () => {
    const exports = { 'libkwin.so.6': ['_ZN4KWin10RenderView16staticMetaObjectE'] };
    expect(findSymbolBreaks(['_ZN4KWin10RenderView16staticMetaObjectE'], exports, exports)).toEqual([]);
  });

  it('ignores symbols from other libraries (no ldd attribution needed)', () => {
    // epoxy symbols are not in kwin's exports, so they are never flagged.
    const breaks = findSymbolBreaks(
      ['epoxy_glBlendColor'],
      { 'libkwin.so.6': ['somethingElse'] },
      { 'libkwin.so.6': ['somethingElse'] },
    );
    expect(breaks).toEqual([]);
  });

  it('ignores a vanished library entirely (the soname ABI channel handles it)', () => {
    const breaks = findSymbolBreaks(
      ['_ZN4KWin10RenderView16staticMetaObjectE'],
      { 'libkwin.so.6': ['_ZN4KWin10RenderView16staticMetaObjectE'] },
      {}, // libkwin.so.6 removed entirely
    );
    expect(breaks).toEqual([]);
  });

  it('finds multiple broken symbols across libraries', () => {
    const breaks = findSymbolBreaks(
      ['a', 'b', 'c'],
      { 'libfoo.so.1': ['a', 'b'], 'libbar.so.2': ['c'] },
      { 'libfoo.so.1': ['a'], 'libbar.so.2': [] },
    );
    expect(breaks).toEqual([
      { symbol: 'b', soname: 'libfoo.so.1' },
      { symbol: 'c', soname: 'libbar.so.2' },
    ]);
  });
});

describe('formatSymbolBreak', () => {
  it('formats a break entry with the owner package', () => {
    expect(formatSymbolBreak({ symbol: 'foo', soname: 'libkwin.so.6', pkgname: 'kwin', pkgId: 1001 })).toBe(
      'kwin: libkwin.so.6: symbol foo missing',
    );
  });
});

describe('compareArchVersions', () => {
  it('orders numeric components correctly (10 > 9)', () => {
    expect(compareArchVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareArchVersions('1.9.0', '1.10.0')).toBeLessThan(0);
  });

  it('orders epochs correctly (17 > 2, 2 > 1)', () => {
    expect(compareArchVersions('17:5.2.0', '2:9.0.1')).toBeGreaterThan(0);
    expect(compareArchVersions('2:9.0.1', '1:99.0')).toBeGreaterThan(0);
  });

  it('treats a missing epoch as 0', () => {
    expect(compareArchVersions('1.0', '1:1.0')).toBeLessThan(0);
  });

  it('considers pkgrel when version is equal', () => {
    expect(compareArchVersions('1.0-2', '1.0-1')).toBeGreaterThan(0);
    expect(compareArchVersions('1.0-1', '1.0-1')).toBe(0);
  });

  it('handles pre-release / git suffixes', () => {
    expect(compareArchVersions('1.0.r475', '1.0.r100')).toBeGreaterThan(0);
    expect(compareArchVersions('1.0.r10', '1.0.r9')).toBeGreaterThan(0);
  });
});

describe('dedupe', () => {
  it('keeps first-seen order', () => {
    expect(dedupe(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});

describe('parseTarVerboseList / isExecutableRegularFile', () => {
  it('parses ls-style bsdtar listing and keeps executable regular files', () => {
    const listing = [
      '-rwxr-xr-x  0 root   root       18 Aug 10 23:13 usr/bin/foo',
      '-rw-r--r--  0 root   root        1 Aug 10 23:13 usr/share/data.txt',
      'lrwxrwxrwx  0 nico   nico        0 Aug 10 23:13 usr/bin/link -> usr/bin/foo',
      'drwxr-xr-x  0 root   root        0 Jan 15  2020 usr/lib/foo',
      '-rwsr-xr-x  0 root   root       18 Aug 10 23:13 usr/bin/suid',
    ].join('\n');
    const entries = parseTarVerboseList(listing);
    expect(entries.map((e) => e.path)).toEqual(['usr/bin/foo', 'usr/share/data.txt', 'usr/bin/suid']);
    expect(entries.find((e) => e.path === 'usr/bin/foo')?.mode).toBe('-rwxr-xr-x');
  });

  it('recognizes executables by execute bits', () => {
    expect(isExecutableRegularFile('-rwxr-xr-x')).toBe(true);
    expect(isExecutableRegularFile('-rw-r--r--')).toBe(false);
    expect(isExecutableRegularFile('-rwsr-xr-x')).toBe(true); // setuid
    expect(isExecutableRegularFile('-rwSr--r--')).toBe(false); // setuid without exec
    expect(isExecutableRegularFile('drwxr-xr-x')).toBe(false); // directory
  });
});

describe('findBrokenDependencies', () => {
  const provided = new Set(['libfoo.so.1', 'libbar.so.2']);

  it('flags a needed soname nobody provides', () => {
    const deps = findBrokenDependencies({
      neededSonames: ['libfoo.so.1', 'libmissing.so.3'],
      files: [],
      providedSonames: provided,
    });
    expect(deps).toEqual([{ kind: 'soname', soname: 'libmissing.so.3' }]);
  });

  it('does not flag provided or base-system sonames', () => {
    const deps = findBrokenDependencies({
      neededSonames: ['libfoo.so.1', 'libc.so.6', 'libstdc++.so.6'],
      files: [],
      providedSonames: provided,
    });
    expect(deps).toEqual([]);
  });

  it('detects a stale python site-packages directory', () => {
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: ['usr/lib/python3.12/site-packages/foo/__init__.py'],
      providedSonames: provided,
      runtimes: { python: '3.13.2' },
    });
    expect(deps).toEqual([
      {
        kind: 'runtime',
        runtime: 'python',
        currentVersion: '3.13',
        pathVersion: '3.12',
        path: 'usr/lib/python3.12/site-packages/foo/__init__.py',
      },
    ]);
  });

  it('detects stale perl, ruby and ghc directories', () => {
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: [
        'usr/lib/perl5/vendor_perl/5.38/Foo.pm',
        'usr/lib/ruby/gems/3.2.0/gems/foo-1.0/lib/foo.rb',
        'usr/lib/ghc-9.2.5/lib/foo.so',
      ],
      providedSonames: provided,
      runtimes: { perl: '5.40.1', ruby: '3.3.5', ghc: '9.4.8' },
    });
    const runtimes = deps.map((d) => d.runtime);
    expect(runtimes).toEqual(['perl', 'ruby', 'ghc']);
  });

  it('ignores a runtime when its version is unknown', () => {
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: ['usr/lib/python3.12/site-packages/foo/__init__.py'],
      providedSonames: provided,
      runtimes: { python: null },
    });
    expect(deps).toEqual([]);
  });

  it('does not flag files matching the current runtime version', () => {
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: ['usr/lib/python3.13/site-packages/foo/__init__.py'],
      providedSonames: provided,
      runtimes: { python: '3.13.2' },
    });
    expect(deps).toEqual([]);
  });

  it('does not flag a self-contained runtime shipping its own interpreter dir', () => {
    // python39 bundles libpython3.9.so and ships usr/lib/python3.9; it is its
    // own python runtime, so a main-python bump must not make it look broken.
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: ['usr/lib/python3.9/site-packages/foo/__init__.py'],
      providedSonames: provided,
      runtimes: { python: '3.13.2' },
      selfProvidedSonames: ['libpython3.9.so.1.0'],
    });
    expect(deps).toEqual([]);
  });

  it('still flags a stale dir when the package does not provide that runtime', () => {
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: ['usr/lib/python3.9/site-packages/foo/__init__.py'],
      providedSonames: provided,
      runtimes: { python: '3.13.2' },
      selfProvidedSonames: ['libfoo.so.1'],
    });
    expect(deps).toEqual([
      {
        kind: 'runtime',
        runtime: 'python',
        currentVersion: '3.13',
        pathVersion: '3.9',
        path: 'usr/lib/python3.9/site-packages/foo/__init__.py',
      },
    ]);
  });

  it('does not exempt ghc consumers: libHS sonames are not an interpreter bundle', () => {
    // A haskell package ships libHS* libs but depends on the ghc runtime, so a
    // ghc bump still breaks it. Only python/perl/ruby have an interpreter lib.
    const deps = findBrokenDependencies({
      neededSonames: [],
      files: ['usr/lib/ghc-9.6.6/lib/foo.so'],
      providedSonames: provided,
      runtimes: { ghc: '9.8.2' },
      selfProvidedSonames: ['libHSfoo-1.0-abc-ghc9.6.6.so'],
    });
    expect(deps).toEqual([
      {
        kind: 'runtime',
        runtime: 'ghc',
        currentVersion: '9.8.2',
        pathVersion: '9.6.6',
        path: 'usr/lib/ghc-9.6.6/lib/foo.so',
      },
    ]);
  });

  it('does not flag a soname the package ships itself (rpath-resolved bundled lib)', () => {
    // LibreOffice-style: the binary needs libmergedlo.so and the package ships
    // usr/lib/app/program/libmergedlo.so next to it. The ELF scan may not
    // record a SONAME for the bundled lib, but it satisfies the DT_NEEDED.
    const deps = findBrokenDependencies({
      neededSonames: ['libmergedlo.so', 'libmissing.so.3'],
      files: ['usr/lib/app/program/libmergedlo.so', 'usr/lib/app/bin/app'],
      providedSonames: provided,
    });
    expect(deps).toEqual([{ kind: 'soname', soname: 'libmissing.so.3' }]);
  });

  it('does not flag an unversioned soname provided via a versioned dev symlink', () => {
    // Arch ncurses ships libncursesw.so -> libncursesw.so.6; a binary linking
    // the unversioned name is satisfied by the dev symlink.
    const deps = findBrokenDependencies({
      neededSonames: ['libncursesw.so', 'libmissing.so.3'],
      files: [],
      providedSonames: new Set(['libncursesw.so.6', 'libformw.so.6']),
    });
    expect(deps).toEqual([{ kind: 'soname', soname: 'libmissing.so.3' }]);
  });

  it('does not flag an absolute-path soname matching a shipped file', () => {
    const deps = findBrokenDependencies({
      neededSonames: ['/usr/lib/lua/5.1/lpeg.so'],
      files: ['usr/lib/lua/5.1/lpeg.so'],
      providedSonames: new Set([]),
    });
    expect(deps).toEqual([]);
  });

  it('does not flag a no-SONAME provider recorded by basename', () => {
    // tcl ships libtcl8.6.so without a SONAME; the consumer's DT_NEEDED is the
    // filename. A basename entry in providedSonames satisfies it.
    const deps = findBrokenDependencies({
      neededSonames: ['libtcl8.6.so'],
      files: [],
      providedSonames: new Set(['libtcl8.6.so', 'libtk8.6.so']),
    });
    expect(deps).toEqual([]);
  });

  it('does not flag an absolute-path soname whose basename is provided', () => {
    // mujs ships /usr/lib/libmujs.so without a SONAME; mpv-full's DT_NEEDED is
    // the absolute path. Matching the basename against providedSonames resolves
    // it even though the consumer ships no such file itself.
    const deps = findBrokenDependencies({
      neededSonames: ['/usr/lib/libmujs.so'],
      files: [],
      providedSonames: new Set(['libmujs.so']),
    });
    expect(deps).toEqual([]);
  });
});

describe('formatBrokenDependency', () => {
  it('formats soname and runtime reasons', () => {
    expect(formatBrokenDependency({ kind: 'soname', soname: 'libmissing.so.3' })).toBe(
      'missing soname libmissing.so.3',
    );
    expect(
      formatBrokenDependency({
        kind: 'runtime',
        runtime: 'python',
        currentVersion: '3.13',
        pathVersion: '3.12',
        path: 'usr/lib/python3.12/site-packages/foo/__init__.py',
      }),
    ).toBe('python 3.12 shipped but python is 3.13 (usr/lib/python3.12/site-packages/foo/__init__.py)');
  });
});

describe('parseReadelfRelocations', () => {
  it('parses absolute and relative relocations, stripping version suffixes', () => {
    const output = [
      "Relocation section '.rela.dyn' at offset 0x28b58 contains 519 entries:",
      "    Offset             Info             Type               Symbol's Value  Symbol's Name + Addend",
      '0000000000028e90  0000006d00000001 R_X86_64_64          0000000000000000 _ZTVN10__cxxabiv120__si_class_type_infoE@CXXABI_1.3 + 10',
      '0000000000028f30  0000011700000001 R_X86_64_64          0000000000000000 _ZN7QObject5eventEP6QEvent@Qt_6 + 0',
      '0000000000028fd0  000000e000000001 R_X86_64_64          0000000000000000 _ZN4KWin6Effect13pointerMotionEPNS_18PointerMotionEventE + 0',
      '',
    ].join('\n');
    expect(parseReadelfRelocations(output)).toEqual([
      { offset: 0x28e90, type: 'R_X86_64_64', symbol: '_ZTVN10__cxxabiv120__si_class_type_infoE' },
      { offset: 0x28f30, type: 'R_X86_64_64', symbol: '_ZN7QObject5eventEP6QEvent' },
      { offset: 0x28fd0, type: 'R_X86_64_64', symbol: '_ZN4KWin6Effect13pointerMotionEPNS_18PointerMotionEventE' },
    ]);
  });

  it('rejoins wrapped symbol names that overflow the readelf column width', () => {
    const output = [
      '0000000000028fe8  0000014700000001 R_X86_64_64          0000000000000000 _ZN4KWin6Effect9touchDownEiRK7QPointFNSt6chrono8durationIlSt5ratioILl1ELl1000000EEEE + 0',
      '',
    ].join('\n');
    const [entry] = parseReadelfRelocations(output);
    expect(entry.symbol).toBe('_ZN4KWin6Effect9touchDownEiRK7QPointFNSt6chrono8durationIlSt5ratioILl1ELl1000000EEEE');
  });
});

describe('parseNmSymbolsWithSize', () => {
  it('parses address, size, type and name', () => {
    const output = [
      '000000000090e698 0000000000000070 D _ZTVN4KWin10ActivitiesE',
      '00000000008fd630 0000000000000080 D _ZTVN4KWin10Decoration16DecorationBridgeE',
      '0000000000000000 0000000000000000 R _ZTI5KWinExample',
      '',
    ].join('\n');
    expect(parseNmSymbolsWithSize(output)).toEqual([
      { address: 0x90e698, size: 0x70, type: 'D', name: '_ZTVN4KWin10ActivitiesE' },
      { address: 0x8fd630, size: 0x80, type: 'D', name: '_ZTVN4KWin10Decoration16DecorationBridgeE' },
      { address: 0x0, size: 0x0, type: 'R', name: '_ZTI5KWinExample' },
    ]);
  });
});

describe('extractVtableSlots', () => {
  it('groups absolute relocations inside a vtable range into ordered slots', () => {
    const symbols = [
      { address: 0x90e698, size: 0x70, type: 'D', name: '_ZTVN4KWin10ActivitiesE' },
      { address: 0x900000, size: 0x40, type: 'D', name: '_ZTVN4KWin10LastResortE' },
    ];
    const slots = extractVtableSlots(
      [
        { offset: 0x90e6d8, type: 'R_X86_64_64', symbol: '_ZN7QObject11evenEP6QEvent' },
        { offset: 0x90e698, type: 'R_X86_64_64', symbol: '_ZTIN4KWin10ActivitiesE' },
        { offset: 0x90e6a8, type: 'R_X86_64_64', symbol: '_ZNK4KWin10Activities10metaObjectEv' },
        { offset: 0x900020, type: 'R_X86_64_64', symbol: '_ZN4KWin10LastResort6finalEv' },
      ] as RelocationEntry[],
      symbols,
    );
    expect(slots).toEqual([
      {
        symbol: '_ZTVN4KWin10ActivitiesE',
        slots: ['_ZNK4KWin10Activities10metaObjectEv', '_ZN7QObject11evenEP6QEvent'],
      },
      { symbol: '_ZTVN4KWin10LastResortE', slots: ['_ZN4KWin10LastResort6finalEv'] },
    ]);
  });

  it('drops relocations outside any vtable range', () => {
    const slots = extractVtableSlots([{ offset: 0xdead, type: 'R_X86_64_64', symbol: '_ZN4KWin6Effect4openEv' }], []);
    expect(slots).toEqual([]);
  });
});

describe('classifyVtableDrift', () => {
  const effectOld = ['metaObject', 'paintScreen', 'postPaintScreen'];

  it('accepts an identical layout', () => {
    expect(classifyVtableDrift(effectOld, effectOld)).toBe('compatible');
  });

  it('accepts appended slots (the Qt/KDE binary-compat rule)', () => {
    expect(classifyVtableDrift(effectOld, [...effectOld, 'pointerMotion', 'touchDown'])).toBe('compatible');
  });

  it('rejects a slot inserted in the middle', () => {
    expect(classifyVtableDrift(effectOld, ['metaObject', 'paintScreen', 'newVirtual', 'postPaintScreen'])).toBe(
      'break',
    );
  });

  it('rejects a removed slot', () => {
    expect(classifyVtableDrift(effectOld, ['metaObject', 'paintScreen'])).toBe('break');
  });
});

describe('findVtableDrifts', () => {
  const oldVtables = {
    _ZTVN4KWin6EffectE: ['metaObject', 'paintScreen', 'postPaintScreen', 'pointerMotion'],
  };
  it('returns nothing when layouts are unchanged', () => {
    expect(findVtableDrifts(oldVtables, oldVtables)).toEqual([]);
  });

  it('returns nothing for a pure append (the Qt/KDE-compatible case)', () => {
    const newVtables = {
      _ZTVN4KWin6EffectE: ['metaObject', 'paintScreen', 'postPaintScreen', 'pointerMotion', 'touchDown'],
    };
    expect(findVtableDrifts(oldVtables, newVtables)).toEqual([]);
  });

  it('reports the shifted tail after a mid-insertion', () => {
    const newVtables = {
      _ZTVN4KWin6EffectE: ['metaObject', 'paintScreen', 'newVirtual', 'postPaintScreen', 'pointerMotion'],
    };
    expect(findVtableDrifts(oldVtables, newVtables)).toEqual([
      { vtable: '_ZTVN4KWin6EffectE', shiftedSlots: ['postPaintScreen', 'pointerMotion'] },
    ]);
  });

  it('reports all slots when the vtable is removed', () => {
    expect(findVtableDrifts(oldVtables, {})).toEqual([
      { vtable: '_ZTVN4KWin6EffectE', shiftedSlots: ['metaObject', 'paintScreen', 'postPaintScreen', 'pointerMotion'] },
    ]);
  });
});

describe('findVtableBreaks', () => {
  const oldVtables = {
    _ZTVN4KWin6EffectE: [
      '_ZN4KWin6Effect10metaObjectEv',
      '_ZN4KWin6Effect11paintScreenEv',
      '_ZN4KWin6Effect15postPaintScreenEv',
      '_ZN4KWin6Effect13pointerMotionEv',
    ],
  };
  const shiftedNewVtables = {
    _ZTVN4KWin6EffectE: [
      '_ZN4KWin6Effect10metaObjectEv',
      '_ZN4KWin6Effect11paintScreenEv',
      '_ZN4KWin6Effect99newVirtualEv',
      '_ZN4KWin6Effect15postPaintScreenEv',
      '_ZN4KWin6Effect13pointerMotionEv',
    ],
  };

  it('flags a consumer that imports a shifted slot', () => {
    const breaks = findVtableBreaks(
      ['_ZN4KWin6Effect11paintScreenEv', '_ZN4KWin6Effect15postPaintScreenEv'],
      oldVtables,
      shiftedNewVtables,
    );
    expect(breaks).toEqual([{ vtable: '_ZTVN4KWin6EffectE', slot: '_ZN4KWin6Effect15postPaintScreenEv' }]);
  });

  it('ignores a consumer that only imports unshifted slots', () => {
    const breaks = findVtableBreaks(['_ZN4KWin6Effect10metaObjectEv'], oldVtables, shiftedNewVtables);
    expect(breaks).toEqual([]);
  });

  it('returns nothing when the layout only appends', () => {
    const breaks = findVtableBreaks(['_ZN4KWin6Effect15postPaintScreenEv'], oldVtables, {
      _ZTVN4KWin6EffectE: [...oldVtables._ZTVN4KWin6EffectE, '_ZN4KWin6Effect7touchUpEv'],
    });
    expect(breaks).toEqual([]);
  });
});

describe('formatConsumerAbiBreak', () => {
  it('formats a symbol break with the owner package', () => {
    expect(formatConsumerAbiBreak({ symbol: 'foo', soname: 'libkwin.so.6', pkgname: 'kwin', pkgId: 1 })).toBe(
      'kwin: libkwin.so.6: symbol foo missing',
    );
  });

  it('formats a vtable break with the owner package', () => {
    expect(
      formatConsumerAbiBreak({
        slot: '_ZN4KWin6Effect15postPaintScreenEv',
        vtable: '_ZTVN4KWin6EffectE',
        pkgname: 'kwin',
        pkgId: 1,
      }),
    ).toBe('kwin: vtable drift (_ZTVN4KWin6EffectE)');
  });
});

describe('buildAnalysis vtables', () => {
  it('derives ordered vtable slot lists from relocation and nm-size output', () => {
    const readelfReloc = [
      "Relocation section '.rela.dyn' at offset 0x0 contains 5 entries:",
      "    Offset             Info             Type               Symbol's Value  Symbol's Name + Addend",
      '000000000090e6a8  0000000000000001 R_X86_64_64          0000000000000000 _ZNK4KWin10Activities10metaObjectEv + 0',
      '000000000090e6d8  0000000000000001 R_X86_64_64          0000000000000000 _ZN7QObject5eventEP6QEvent@Qt_6 + 0',
      '000000000090e6a0  0000000000000001 R_X86_64_64          0000000000000000 _ZTIN4KWin10ActivitiesE + 0',
      '000000000090e6b0  0000000000000001 R_X86_64_64          0000000000000000 _ZN4KWin10Activities4openEv + 0',
      '',
    ].join('\n');
    const nmSizes = [
      '000000000090e698 0000000000000070 D _ZTVN4KWin10ActivitiesE',
      '000000000090e700 0000000000000040 D _ZTVN4KWin10OtherClassE',
      '',
    ].join('\n');

    const analysis = buildAnalysis({
      version: '6.7.4-3',
      fileList: 'usr/lib/libkwin.so.6.7.4\nusr/lib/libkwin.so.6',
      readelfByFile: new Map([
        ['usr/lib/libkwin.so.6.7.4', '0x000000000000000e (SONAME)             Library soname: [libkwin.so.6]\n'],
      ]),
      importsByFile: new Map(),
      exportsByFile: new Map([['usr/lib/libkwin.so.6.7.4', '_ZTVN4KWin10ActivitiesE\n']]),
      relocationsByFile: new Map([['usr/lib/libkwin.so.6.7.4', readelfReloc]]),
      nmSizesByFile: new Map([['usr/lib/libkwin.so.6.7.4', nmSizes]]),
    });

    // The typeinfo pointer (_ZTI) and the outside-range relocation are skipped;
    // slots are sorted by offset (a8 -> b0 -> d8).
    expect(analysis.vtables['_ZTVN4KWin10ActivitiesE']).toEqual([
      '_ZNK4KWin10Activities10metaObjectEv',
      '_ZN4KWin10Activities4openEv',
      '_ZN7QObject5eventEP6QEvent',
    ]);
  });
});

describe('buildDependencyGraph', () => {
  const nodes = [
    {
      pkgType: '0' as const,
      pkgId: 1,
      pkgname: 'kwin',
      providedSonames: ['libkwin.so.6'],
      neededSonames: ['libc.so.6', 'libQt6Core.so.6'],
    },
    {
      pkgType: '1' as const,
      pkgId: 2,
      pkgname: 'better-blur',
      providedSonames: ['libbetter_blur_dx.so'],
      neededSonames: ['libkwin.so.6', 'libc.so.6'],
    },
    {
      pkgType: '1' as const,
      pkgId: 3,
      pkgname: 'unrelated',
      providedSonames: [],
      neededSonames: ['libc.so.6'],
    },
  ];

  it('matches needed sonames to providers across arch and chaotic, skipping base system', () => {
    const edges = buildDependencyGraph(nodes);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      consumer: nodes[1],
      provider: nodes[0],
      soname: 'libkwin.so.6',
    });
  });

  it('does not create a self-dependency', () => {
    const selfProviding = [
      {
        pkgType: '0' as const,
        pkgId: 1,
        pkgname: 'foo',
        providedSonames: ['libfoo.so.1'],
        neededSonames: ['libfoo.so.1'],
      },
    ];
    expect(buildDependencyGraph(selfProviding)).toEqual([]);
  });
});

describe('libraryBaseName', () => {
  it('strips the version suffix from a versioned soname', () => {
    expect(libraryBaseName('libavcodec.so.61')).toBe('libavcodec.so');
    expect(libraryBaseName('libavcodec.so.61.0.1')).toBe('libavcodec.so');
  });

  it('returns the basename unchanged when there is no .so. version', () => {
    expect(libraryBaseName('libfoo.so')).toBe('libfoo.so');
    expect(libraryBaseName('usr/lib/libfoo.so')).toBe('libfoo.so');
  });
});

describe('sameLibraryFamily', () => {
  it('matches two versions of the same library', () => {
    expect(sameLibraryFamily('libavcodec.so.61', 'libavcodec.so.60')).toBe(true);
  });

  it('matches different minor versions of the same runtime interpreter', () => {
    expect(sameLibraryFamily('libpython3.9.so.1.0', 'libpython3.13.so.1.0')).toBe(true);
  });

  it('does not match unrelated libraries', () => {
    expect(sameLibraryFamily('libavcodec.so.61', 'libkwin.so.6')).toBe(false);
  });
});

describe('latestAnalysisByKey', () => {
  const rows = (versions: string[], key: string) => versions.map((version) => ({ key, version }));

  it('keeps the newest version per key by Arch order', () => {
    const latest = latestAnalysisByKey(rows(['2:9.0-1', '2:10.0-1', '2:11.0-1'], 'a'), (row) => row.key);
    expect([...latest.values()]).toEqual([{ key: 'a', version: '2:11.0-1' }]);
  });

  it('groups by the provided key', () => {
    const latest = latestAnalysisByKey(
      [
        { key: 'a', version: '1.0-1' },
        { key: 'b', version: '2.0-1' },
        { key: 'a', version: '1.1-1' },
      ],
      (row) => row.key,
    );
    expect([...latest.values()]).toEqual([
      { key: 'a', version: '1.1-1' },
      { key: 'b', version: '2.0-1' },
    ]);
  });

  it('returns an empty map for empty input', () => {
    expect(latestAnalysisByKey([], () => 'x').size).toBe(0);
  });
});

describe('compareArchVersions edge cases', () => {
  it('orders a numeric run newer than an alphanumeric run (1.0.1 > 1.0.a)', () => {
    expect(compareArchVersions('1.0.1', '1.0.a')).toBeGreaterThan(0);
  });

  it('orders a shorter version older than its extension (1.0 < 1.0.0)', () => {
    expect(compareArchVersions('1.0', '1.0.0')).toBeLessThan(0);
  });

  it('compares leading-zero numeric runs by value', () => {
    expect(compareArchVersions('1.0.01', '1.0.1')).toBe(0);
  });
});
