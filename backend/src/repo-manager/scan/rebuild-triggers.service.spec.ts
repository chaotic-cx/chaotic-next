import type { BumpService } from '../bump';
import type { Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Package } from '../../builder/builder.entity';
import { type OwnerDescriptor, type PluginBreakIndexEntry, TriggerType } from '../../interfaces/repo-manager';
import { RebuildTriggerService, summarizeDetails } from './rebuild-triggers.service';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
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
  return new RebuildTriggerService(stubRepo, stubArchRepo, stubPackageRepo, stubBump);
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
  const service = new RebuildTriggerService(analysisRepo, stubArchRepo, stubPackageRepo, stubBump);
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
