import type { BumpService } from '../bump';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { Package } from '../../builder/builder.entity';
import { type OwnerDescriptor, type PluginBreakIndexEntry, TriggerType } from '../../interfaces/repo-manager';
import { RebuildTriggerService, summarizeDetails } from './rebuild-triggers.service';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { buildAnalysis } from '../signal';
import type { MockRepository } from '../test/mock-repository';
import { createMockRepository } from '../test/mock-repository';

/**
 * consumerSymbolBreaksFor is the pure plugin-ABI intersection: it must flag a
 * consumer importing symbols an owner dropped, but NOT a consumer that bundles
 * its own copy of the owner's library (e.g. python39 shipping libpython3.9 is
 * not a victim of the system python dropping symbols on a 3.13 -> 3.14 bump).
 */

const OWNER_KEY = 'a222';

function makeConsumer(overrides: Partial<PackageElfAnalysis> = {}): PackageElfAnalysis {
  return {
    id: 1,
    pkgType: '1',
    pkgId: 1,
    version: '1.0-1',
    files: [],
    neededSonames: [],
    providedSonames: [],
    importedSymbols: [],
    exportedSymbols: {},
    vtables: {},
    directoriesOwned: [],
    directDirectories: [],
    pluginOf: [OWNER_KEY],
    broken: false,
    brokenReasons: [],
    scannedAt: new Date(),
    ...overrides,
  } as PackageElfAnalysis;
}

function breakIndex(): Map<string, PluginBreakIndexEntry> {
  const index = new Map<string, PluginBreakIndexEntry>();
  index.set(OWNER_KEY, {
    pkgname: 'python',
    pkgId: 222,
    symbolBreaks: [
      {
        pkgname: 'python',
        pkgId: 222,
        soname: 'libpython3.13.so.1.0',
        lostSymbols: ['PyArg_ParseTuple', 'PyBool_Type'],
      },
    ],
    vtableDrifts: [],
  });
  return index;
}

function createService(): RebuildTriggerService {
  const stubRepo = {} as unknown as Repository<PackageElfAnalysis>;
  const stubArchRepo = {} as unknown as Repository<ArchlinuxPackage>;
  const stubPackageRepo = {} as unknown as Repository<Package>;
  const stubBump = {} as unknown as BumpService;
  const stubPino = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  } as unknown as PinoLogger;
  return new RebuildTriggerService(stubRepo, stubArchRepo, stubPackageRepo, stubBump, stubPino);
}

function createMockService(): {
  service: RebuildTriggerService;
  analysisRepo: MockRepository<PackageElfAnalysis>;
} {
  const analysisRepo = createMockRepository<PackageElfAnalysis>({
    keyOf: (a) => `${a.pkgType}|${a.pkgId}|${a.version}`,
  });
  const stubArchRepo = {} as unknown as Repository<ArchlinuxPackage>;
  const stubPackageRepo = {} as unknown as Repository<Package>;
  const stubBump = {} as unknown as BumpService;
  const stubPino = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  } as unknown as PinoLogger;
  const service = new RebuildTriggerService(analysisRepo, stubArchRepo, stubPackageRepo, stubBump, stubPino);
  return { service, analysisRepo };
}

describe('consumerSymbolBreaksFor', () => {
  it('flags a consumer importing a dropped symbol from the affected library', () => {
    const service = createService();
    const consumer = makeConsumer({ importedSymbols: ['PyArg_ParseTuple', 'malloc'] });

    const breaks = service.consumerSymbolBreaksFor(consumer, breakIndex());

    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ symbol: 'PyArg_ParseTuple', soname: 'libpython3.13.so.1.0' });
  });

  it('does not flag a consumer that imports nothing the owner dropped', () => {
    const service = createService();
    const consumer = makeConsumer({ importedSymbols: ['malloc', 'free'] });

    expect(service.consumerSymbolBreaksFor(consumer, breakIndex())).toEqual([]);
  });

  it('does not flag a consumer that bundles its own copy of the affected library', () => {
    // python39 ships its own libpython3.9.so.1.0, so it resolves Py* symbols
    // against its bundled interpreter, not the system python. A python bump must
    // not rebuild it.
    const service = createService();
    const consumer = makeConsumer({
      importedSymbols: ['PyArg_ParseTuple', 'PyBool_Type'],
      providedSonames: ['libpython3.9.so.1.0'],
    });

    expect(service.consumerSymbolBreaksFor(consumer, breakIndex())).toEqual([]);
  });

  it('still flags a consumer that provides an unrelated library', () => {
    // Bundling libfoo.so must not mask a real python break.
    const service = createService();
    const consumer = makeConsumer({
      importedSymbols: ['PyBool_Type'],
      providedSonames: ['libfoo.so.1'],
    });

    const breaks = service.consumerSymbolBreaksFor(consumer, breakIndex());
    expect(breaks).toHaveLength(1);
    expect((breaks[0] as { symbol: string }).symbol).toBe('PyBool_Type');
  });

  it('ignores universal runtime vtable slots that every C++ binary imports', () => {
    // __cxa_pure_virtual appears as a pure-virtual placeholder slot in many
    // vtables and is imported by every C++ package. Matching against it would
    // flag every C++ consumer whenever any library's vtable drifts.
    const service = createService();
    const vtableIndex = new Map<string, PluginBreakIndexEntry>();
    vtableIndex.set(OWNER_KEY, {
      pkgname: 'flac',
      pkgId: 2322,
      symbolBreaks: [],
      vtableDrifts: [
        {
          vtable: '_ZTVN4FLAC7Decoder4FileE',
          shiftedSlots: ['__cxa_pure_virtual', '_ZN4FLAC7Decoder6Stream4initEv'],
        },
      ],
    });
    const consumer = makeConsumer({
      importedSymbols: ['__cxa_pure_virtual'],
    });

    expect(service.consumerSymbolBreaksFor(consumer, vtableIndex)).toEqual([]);
  });
});

describe('brokenDepsForConsumer — version-node break (onnxruntime style)', () => {
  function onnxContext(): {
    changed: ArchlinuxPackage[];
    providedByPkgname: Map<string, Set<string>>;
    archProvidedSonames: Set<string>;
    runtimes: Partial<Record<'python' | 'perl' | 'ruby' | 'ghc', string | null>>;
    previousProvidedByPkg: Map<number, Set<string>>;
    currentProvidedByPkg: Map<number, Set<string>>;
    currentVersionNodesByPkg: Map<number, Record<string, string[]>>;
  } {
    const onnx = {
      id: 222,
      pkgname: 'onnxruntime',
      previousVersion: '1.28.0-1',
      version: '1.29.0-1',
    } as ArchlinuxPackage;
    const empty = new Map<string, Set<string>>();
    return {
      changed: [onnx],
      providedByPkgname: empty,
      archProvidedSonames: new Set(),
      runtimes: {},
      previousProvidedByPkg: new Map([[222, new Set(['libonnxruntime.so.1'])]]),
      currentProvidedByPkg: new Map([[222, new Set(['libonnxruntime.so.1'])]]),
      currentVersionNodesByPkg: new Map([[222, { 'libonnxruntime.so.1': ['VERS_1.29.0'] }]]),
    };
  }

  it('flags a consumer needing a version node the updated provider dropped', () => {
    const service = createService();
    const consumer = makeConsumer({
      neededSonames: ['libonnxruntime.so.1'],
      neededVersionNodes: { 'libonnxruntime.so.1': ['VERS_1.28.0'] },
    });

    const result = (
      service as unknown as {
        brokenDepsForConsumer(
          c: PackageElfAnalysis,
          ctx: unknown,
          deps: string[],
        ): { deps: { kind: 'version'; soname: string; versionNodes: string[] }[]; archPkg: ArchlinuxPackage } | null;
      }
    ).brokenDepsForConsumer(consumer, onnxContext(), []);

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.archPkg.pkgname).toBe('onnxruntime');
    expect(result.deps).toEqual([{ kind: 'version', soname: 'libonnxruntime.so.1', versionNodes: ['VERS_1.28.0'] }]);
  });

  it('does not flag when the needed node is still provided', () => {
    const service = createService();
    const consumer = makeConsumer({ neededVersionNodes: { 'libonnxruntime.so.1': ['VERS_1.29.0'] } });

    const result = (
      service as unknown as {
        brokenDepsForConsumer(c: PackageElfAnalysis, ctx: unknown, deps: string[]): unknown;
      }
    ).brokenDepsForConsumer(consumer, onnxContext(), []);

    expect(result).toBeNull();
  });

  it('ignores SUNWprivate_1.1 from libjli.so — quartus-130 regression (private nodes are not ABI)', () => {
    const service = createService();
    const consumer = makeConsumer({ neededVersionNodes: { 'libjli.so': ['SUNWprivate_1.1'] } });
    // intellij-idea-community-edition provides libjli.so but not the private node
    const ctx = {
      changed: [
        {
          id: 999,
          pkgname: 'intellij-idea-community-edition',
          previousVersion: '1-1',
          version: '1-2',
        } as ArchlinuxPackage,
      ],
      providedByPkgname: new Map(),
      archProvidedSonames: new Set(),
      runtimes: {},
      previousProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentVersionNodesByPkg: new Map([[999, { 'libjli.so': [] }]]),
    };
    const result = (
      service as unknown as {
        brokenDepsForConsumer(c: PackageElfAnalysis, ctx: unknown, deps: string[]): unknown;
      }
    ).brokenDepsForConsumer(consumer, ctx, ['intellij-idea-community-edition']);
    expect(result).toBeNull();
  });

  it('does not flag when consumer self-provides the soname (quartus bundles libjli.so)', () => {
    const service = createService();
    const consumer = makeConsumer({
      providedSonames: ['libjli.so'],
      neededVersionNodes: { 'libjli.so': ['VERS_1.28.0'] },
    });
    const ctx = {
      changed: [
        {
          id: 999,
          pkgname: 'intellij-idea-community-edition',
          previousVersion: '1-1',
          version: '1-2',
        } as ArchlinuxPackage,
      ],
      providedByPkgname: new Map(),
      archProvidedSonames: new Set(),
      runtimes: {},
      previousProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentVersionNodesByPkg: new Map([[999, { 'libjli.so': [] }]]),
    };
    const result = (
      service as unknown as {
        brokenDepsForConsumer(c: PackageElfAnalysis, ctx: unknown, deps: string[]): unknown;
      }
    ).brokenDepsForConsumer(consumer, ctx, ['intellij-idea-community-edition']);
    expect(result).toBeNull();
  });

  it('does not blame a changed provider the consumer does not depend on', () => {
    const service = createService();
    const consumer = makeConsumer({ neededVersionNodes: { 'libjli.so': ['VERS_1.28.0'] } });
    const ctx = {
      changed: [
        {
          id: 999,
          pkgname: 'intellij-idea-community-edition',
          previousVersion: '1-1',
          version: '1-2',
        } as ArchlinuxPackage,
      ],
      providedByPkgname: new Map(),
      archProvidedSonames: new Set(),
      runtimes: {},
      previousProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentVersionNodesByPkg: new Map([[999, { 'libjli.so': [] }]]),
    };
    const result = (
      service as unknown as {
        brokenDepsForConsumer(c: PackageElfAnalysis, ctx: unknown, deps: string[]): unknown;
      }
    ).brokenDepsForConsumer(consumer, ctx, ['java-runtime']);
    expect(result).toBeNull();
  });

  it('quartus-130 via real ELF extraction — libinstrument needs SUNWprivate_1.1 from libjli.so, JDK21 drops it, but private is filtered', () => {
    // Real readelf -VW snippets from Arch: jre8 libinstrument.so (consumer) and
    // jdk21 libjli.so (provider) vs jdk8 libjli.so. Mirrors the reported
    // quartus-130 → intellij-idea-community-edition false positive.
    const LIBINSTRUMENT_VERSION_INFO = `
Version definition section '.gnu.version_d' contains 2 entries:
 Addr: 0x0000000000000e40  Offset: 0x00000e40  Link: 5 (.dynstr)
  000000: Rev: 1  Flags: BASE  Index: 1  Cnt: 1  Name: libinstrument.so
  0x001c: Rev: 1  Flags: none  Index: 2  Cnt: 1  Name: SUNWprivate_1.1

Version needs section '.gnu.version_r' contains 2 entries:
 Addr: 0x0000000000000e78  Offset: 0x00000e78  Link: 5 (.dynstr)
  000000: Version: 1  File: libjli.so  Cnt: 1
  0x0010:   Name: SUNWprivate_1.1  Flags: none  Version: 8
  0x0020: Version: 1  File: libc.so.6  Cnt: 6
  0x0030:   Name: GLIBC_ABI_DT_RELR  Flags: none  Version: 9
  0x0040:   Name: GLIBC_2.14  Flags: none  Version: 7
  0x0050:   Name: GLIBC_2.3  Flags: none  Version: 6
  0x0060:   Name: GLIBC_2.3.4  Flags: none  Version: 5
  0x0070:   Name: GLIBC_2.4  Flags: none  Version: 4
  0x0080:   Name: GLIBC_2.2.5  Flags: none  Version: 3
`;
    const JDK21_LIBJLI_VERSION_INFO = `
Version needs section '.gnu.version_r' contains 1 entry:
 Addr: 0x0000000000001388  Offset: 0x00001388  Link: 4 (.dynstr)
  000000: Version: 1  File: libc.so.6  Cnt: 9
  0x0010:   Name: GLIBC_ABI_DT_RELR  Flags: none  Version: 10
  0x0020:   Name: GLIBC_2.14  Flags: none  Version: 9
  0x0030:   Name: GLIBC_2.3  Flags: none  Version: 8
  0x0040:   Name: GLIBC_2.33  Flags: none  Version: 7
  0x0050:   Name: GLIBC_2.38  Flags: none  Version: 6
  0x0060:   Name: GLIBC_2.4  Flags: none  Version: 5
  0x0070:   Name: GLIBC_2.34  Flags: none  Version: 4
  0x0080:   Name: GLIBC_2.3.4  Flags: none  Version: 3
  0x0090:   Name: GLIBC_2.2.5  Flags: none  Version: 2
`;
    const consumerAnalysis = buildAnalysis({
      version: '8.504.u01-1',
      fileList: 'usr/lib/jvm/java-8-openjdk/jre/lib/amd64/libinstrument.so',
      readelfByFile: new Map([
        [
          'usr/lib/jvm/java-8-openjdk/jre/lib/amd64/libinstrument.so',
          '0x0000000000000001 (NEEDED)             Shared library: [libjli.so]\n0x000000000000000e (SONAME)             Library soname: [libinstrument.so]',
        ],
      ]),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
      versionInfoByFile: new Map([
        ['usr/lib/jvm/java-8-openjdk/jre/lib/amd64/libinstrument.so', LIBINSTRUMENT_VERSION_INFO],
      ]),
    });
    const provider21 = buildAnalysis({
      version: '21.0.12.1.u1-1',
      fileList: 'usr/lib/jvm/java-21-openjdk/lib/libjli.so',
      readelfByFile: new Map([
        [
          'usr/lib/jvm/java-21-openjdk/lib/libjli.so',
          '0x000000000000000e (SONAME)             Library soname: [libjli.so]',
        ],
      ]),
      importsByFile: new Map(),
      exportsByFile: new Map(),
      relocationsByFile: new Map(),
      nmSizesByFile: new Map(),
      versionInfoByFile: new Map([['usr/lib/jvm/java-21-openjdk/lib/libjli.so', JDK21_LIBJLI_VERSION_INFO]]),
    });

    expect(consumerAnalysis.neededVersionNodes['libjli.so']).toEqual(['SUNWprivate_1.1']);
    expect(provider21.providedVersionNodes['libjli.so']).toBeUndefined();

    const service = createService();
    const ctx = {
      changed: [
        {
          id: 999,
          pkgname: 'intellij-idea-community-edition',
          previousVersion: '1-1',
          version: '1-2',
        } as ArchlinuxPackage,
      ],
      providedByPkgname: new Map(),
      archProvidedSonames: new Set(),
      runtimes: {},
      previousProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentProvidedByPkg: new Map([[999, new Set(['libjli.so'])]]),
      currentVersionNodesByPkg: new Map([[999, provider21.providedVersionNodes]]),
    };
    const consumer = makeConsumer({
      neededVersionNodes: consumerAnalysis.neededVersionNodes,
      neededSonames: consumerAnalysis.neededSonames,
    });
    const result = (
      service as unknown as {
        brokenDepsForConsumer(c: PackageElfAnalysis, ctx: unknown, deps: string[]): unknown;
      }
    ).brokenDepsForConsumer(consumer, ctx, ['intellij-idea-community-edition']);
    expect(result).toBeNull();
  });
});

describe('summarizeDetails', () => {
  it('truncates a long list to the first entry plus a count suffix', () => {
    const details = ['libpython3.13.so.1.0: symbol PyArg_ParseTuple missing', 'two', 'three', 'four'];
    expect(summarizeDetails(details)).toEqual(['libpython3.13.so.1.0: symbol PyArg_ParseTuple missing', '... 3 more']);
  });
});

describe('buildPluginBreakIndex', () => {
  const owner = (pkgId: number, previousVersion: string, currentVersion: string): OwnerDescriptor => ({
    pkgType: TriggerType.ARCH,
    pkgId,
    pkgname: 'python',
    previousVersion,
    currentVersion,
  });

  function makeAnalysis(overrides: Partial<PackageElfAnalysis>): PackageElfAnalysis {
    return {
      id: overrides.pkgId ?? 0,
      pkgType: '0',
      pkgId: overrides.pkgId ?? 0,
      version: overrides.version ?? '',
      files: [],
      neededSonames: [],
      providedSonames: [],
      importedSymbols: [],
      exportedSymbols: {},
      vtables: {},
      directoriesOwned: [],
      directDirectories: [],
      pluginOf: [],
      broken: false,
      brokenReasons: [],
      scannedAt: new Date(),
      ...overrides,
    } as PackageElfAnalysis;
  }

  it('flags symbols dropped from a soname that still exists', async () => {
    const { service, analysisRepo } = createMockService();
    analysisRepo.seed([
      makeAnalysis({
        pkgId: 222,
        version: '3.13',
        exportedSymbols: { 'libpython3.13.so.1.0': ['PyArg_ParseTuple', 'PyBool_Type'] },
      }),
      makeAnalysis({ pkgId: 222, version: '3.14', exportedSymbols: { 'libpython3.13.so.1.0': ['PyArg_ParseTuple'] } }),
    ]);

    const index = await service.buildPluginBreakIndex([owner(222, '3.13', '3.14')]);

    expect(index.get('a222')?.symbolBreaks).toEqual([
      { pkgname: 'python', pkgId: 222, soname: 'libpython3.13.so.1.0', lostSymbols: ['PyBool_Type'] },
    ]);
  });

  it('does NOT report a soname rename as symbol loss (the soname channel handles it)', async () => {
    // python 3.13 -> 3.14 renames libpython3.13.so.1.0 to libpython3.14.so.1.0.
    // The old soname disappears, so this must not be reported as "all symbols
    // lost" — that is a BROKEN_DEPS/soname break, not a symbol-loss plugin break.
    const { service, analysisRepo } = createMockService();
    analysisRepo.seed([
      makeAnalysis({
        pkgId: 222,
        version: '3.13',
        exportedSymbols: { 'libpython3.13.so.1.0': ['PyArg_ParseTuple', 'PyBool_Type', 'PyLong_FromLong'] },
      }),
      makeAnalysis({
        pkgId: 222,
        version: '3.14',
        exportedSymbols: { 'libpython3.14.so.1.0': ['PyArg_ParseTuple', 'PyBool_Type', 'PyLong_FromLong'] },
      }),
    ]);

    const index = await service.buildPluginBreakIndex([owner(222, '3.13', '3.14')]);

    // No symbol breaks and no vtable drift, so no index entry is created at all.
    expect(index.size).toBe(0);
  });
});

describe('loadLatestChaoticAnalyses', () => {
  function makeChaoticAnalysis(overrides: Partial<PackageElfAnalysis>): PackageElfAnalysis {
    return {
      id: 0,
      pkgType: '1',
      pkgId: 0,
      version: '',
      files: [],
      neededSonames: [],
      providedSonames: [],
      importedSymbols: [],
      exportedSymbols: {},
      vtables: {},
      directoriesOwned: [],
      directDirectories: [],
      pluginOf: [],
      broken: false,
      brokenReasons: [],
      scannedAt: new Date(),
      ...overrides,
    } as PackageElfAnalysis;
  }

  it('keeps only the newest version per package by Arch version order', async () => {
    const { service, analysisRepo } = createMockService();
    analysisRepo.seed([
      makeChaoticAnalysis({ pkgId: 7, version: '2:9', importedSymbols: ['old'] }),
      makeChaoticAnalysis({ pkgId: 7, version: '2:13', importedSymbols: ['new'] }),
      makeChaoticAnalysis({ pkgId: 7, version: '1.10', importedSymbols: ['older'] }),
    ]);

    const map = await service.loadLatestChaoticAnalyses([7]);

    expect(map.size).toBe(1);
    expect(map.get(7)?.importedSymbols).toEqual(['new']);
  });

  it('loads only the columns the trigger checks read', async () => {
    // Full rows hydrate megabytes of exportedSymbols/vtables per package and
    // exhausted the heap; the query must stay restricted to the narrow set.
    const { service, analysisRepo } = createMockService();
    analysisRepo.seed([makeChaoticAnalysis({ pkgId: 7, version: '1.0', importedSymbols: ['foo'], pluginOf: ['a1'] })]);

    const map = await service.loadLatestChaoticAnalyses([7]);

    const row = map.get(7) as unknown as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([
      'files',
      'importedSymbols',
      'neededSonames',
      'neededVersionNodes',
      'pkgId',
      'pluginOf',
      'providedSonames',
      'version',
    ]);
  });

  it('queries in batches of 500 ids and still resolves every package', async () => {
    const { service, analysisRepo } = createMockService();
    const pkgIds = Array.from({ length: 1200 }, (unused, index) => index + 1);
    analysisRepo.seed(pkgIds.map((pkgId) => makeChaoticAnalysis({ pkgId, version: '1.0' })));

    const map = await service.loadLatestChaoticAnalyses(pkgIds);

    expect(analysisRepo.find).toHaveBeenCalledTimes(3);
    expect(map.size).toBe(1200);
  });
});

describe('providedForDeps (provider attribution)', () => {
  const service = createService();
  const noArchSonames = new Set<string>();

  it('attributes a soname to its real provider, not any provider', () => {
    // AyuGram needs libavfilter.so.11 and depends on ffmpeg. The soname is also
    // provided by an unrelated package (losslesscut-bin's bundled ffmpeg-obs),
    // which must NOT satisfy AyuGram. Only ffmpeg's current libavfilter.so.12
    // counts because AyuGram depends on ffmpeg.
    const providedByPkgname = new Map<string, Set<string>>([
      ['libavfilter.so.11', new Set(['ffmpeg-obs', 'losslesscut-bin'])],
      ['libavfilter.so.12', new Set(['ffmpeg'])],
    ]);

    // Depends on ffmpeg -> only libavfilter.so.12 is satisfied.
    const ffmpegConsumer = service.providedForDeps(providedByPkgname, ['ffmpeg', 'qt6-base'], noArchSonames);
    expect(ffmpegConsumer.has('libavfilter.so.12')).toBe(true);
    expect(ffmpegConsumer.has('libavfilter.so.11')).toBe(false);

    // Depends on ffmpeg-obs -> libavfilter.so.11 is satisfied via that provider.
    const obsConsumer = service.providedForDeps(providedByPkgname, ['ffmpeg-obs'], noArchSonames);
    expect(obsConsumer.has('libavfilter.so.11')).toBe(true);
  });

  it('always satisfies sonames any current Arch package provides (transitive resolution)', () => {
    // spotify needs libharfbuzz.so.0 while only declaring gtk3; pacman pulls
    // harfbuzz transitively, so the Arch-provided soname must not be flagged.
    const providedByPkgname = new Map<string, Set<string>>([['libharfbuzz.so.0', new Set(['harfbuzz'])]]);
    const archSonames = new Set(['libharfbuzz.so.0']);

    const consumer = service.providedForDeps(providedByPkgname, ['gtk3'], archSonames);
    expect(consumer.has('libharfbuzz.so.0')).toBe(true);
  });

  it('treats missing deps as a no-op (all providers count)', () => {
    const providedByPkgname = new Map<string, Set<string>>([['libfoo.so.1', new Set(['foo'])]]);
    expect(service.providedForDeps(providedByPkgname, [], noArchSonames)).toEqual(new Set(['libfoo.so.1']));
  });
});
