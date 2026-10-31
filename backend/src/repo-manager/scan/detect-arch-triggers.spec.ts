import { describe, expect, it, vi } from 'vitest';
import { Package } from '../../builder/builder.entity';
import { BumpType, TriggerType } from '../../interfaces/repo-manager';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { createMockRepository } from '../test/mock-repository';
import { TriggerDetector } from './trigger-detector';

const REPO_ID = 1;
const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

function analysis(overrides: Partial<PackageElfAnalysis>): PackageElfAnalysis {
  return {
    pkgType: '1',
    version: '1.0-1',
    files: [],
    neededSonames: [],
    providedSonames: [],
    importedSymbols: [],
    exportedSymbols: {},
    providedVersionNodes: {},
    neededVersionNodes: {},
    vtables: {},
    pluginOf: [],
    broken: false,
    brokenReasons: [],
    brokenSince: null,
    scannedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as PackageElfAnalysis;
}

function archPkg(overrides: Partial<ArchlinuxPackage>): ArchlinuxPackage {
  return { deactivatedAt: null, previousVersion: null, metadata: null, ...overrides } as ArchlinuxPackage;
}

function chaoticPkg(overrides: Partial<Package>): Package {
  return {
    isActive: true,
    skipSignalScan: false,
    pkgbaseName: null,
    repo: { id: REPO_ID },
    metadata: { buildDate: '0', filename: 'x', deps: [] },
    ...overrides,
  } as Package;
}

function createDetector(seed: {
  arch: ArchlinuxPackage[];
  chaotic: Package[];
  analyses: PackageElfAnalysis[];
  bumps?: { pkgId: number; timestamp: Date }[];
}) {
  const analyses = createMockRepository<PackageElfAnalysis>({ keyOf: (a) => `${a.pkgType}|${a.pkgId}|${a.version}` });
  const archPackages = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
  const packages = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
  analyses.seed(seed.analyses);
  archPackages.seed(seed.arch);
  packages.seed(seed.chaotic);
  const bumps = seed.bumps ?? [];
  Object.assign(packages, {
    manager: {
      find: vi.fn(async (entity: unknown, options: { where: { pkg: { id: number }; timestamp: { _value: Date } } }) =>
        bumps.filter((bump) => bump.pkgId === options.where.pkg.id && bump.timestamp >= options.where.timestamp._value),
      ),
    },
  });

  return new TriggerDetector(analyses, archPackages, packages, logger);
}

describe('TriggerDetector.detectArchTriggers', () => {
  it('keys a broken split output by its PKGBUILD directory', async () => {
    const detector = createDetector({
      arch: [
        archPkg({ id: 30, pkgname: 'lib32-llvm-libs', previousVersion: '22.1.8-1', version: '23.1.1', pkgrel: 1 }),
      ],
      chaotic: [
        chaoticPkg({ id: 10, pkgname: 'mesa-tkg-git' }),
        chaoticPkg({
          id: 11,
          pkgname: 'lib32-mesa-tkg-git',
          pkgbaseName: 'mesa-tkg-git',
          metadata: { buildDate: '0', filename: 'x', deps: ['lib32-llvm-libs'] },
        }),
      ],
      analyses: [
        analysis({ pkgType: '0', pkgId: 30, version: '22.1.8-1', providedSonames: ['libLLVM.so.22.1'] }),
        analysis({ pkgType: '0', pkgId: 30, version: '23.1.1-1', providedSonames: ['libLLVM.so.23.1'] }),
        analysis({ pkgId: 11, neededSonames: ['libLLVM.so.22.1'] }),
      ],
    });

    const detected = await detector.detectArchTriggers(REPO_ID, [30]);

    expect([...detected.keys()]).toEqual(['mesa-tkg-git']);
    expect(detected.get('mesa-tkg-git')).toMatchObject({
      bumpType: BumpType.BROKEN_DEPS,
      triggerFrom: TriggerType.ARCH,
      ownerId: 30,
    });
  });

  it('does not rebuild the consumers of a package that left the Arch repos without a successor', async () => {
    const detector = createDetector({
      arch: [
        archPkg({
          id: 31,
          pkgname: 'qt5-virtualkeyboard',
          previousVersion: '5.15.18-1',
          version: '5.15.18',
          pkgrel: 1,
          deactivatedAt: new Date('2026-09-20T00:00:00Z'),
        }),
      ],
      chaotic: [
        chaoticPkg({ id: 12, pkgname: 'insync', metadata: { buildDate: '0', filename: 'x', deps: ['qt5-base'] } }),
      ],
      analyses: [
        analysis({ pkgType: '0', pkgId: 31, version: '5.15.18-1', providedSonames: ['libQt5VirtualKeyboard.so.5'] }),
        analysis({ pkgId: 12, neededSonames: ['libQt5VirtualKeyboard.so.5'] }),
      ],
    });

    const detected = await detector.detectArchTriggers(REPO_ID, [31]);

    expect(detected.has('insync')).toBe(false);
  });

  it('compares against an older analysis when the previous version was never analyzed', async () => {
    const detector = createDetector({
      arch: [archPkg({ id: 32, pkgname: 'libfoo', previousVersion: '2.0-1', version: '3.0', pkgrel: 1 })],
      chaotic: [
        chaoticPkg({ id: 13, pkgname: 'foo-viewer', metadata: { buildDate: '0', filename: 'x', deps: ['libfoo'] } }),
      ],
      analyses: [
        analysis({ pkgType: '0', pkgId: 32, version: '1.0-1', providedSonames: ['libfoo.so.2'] }),
        analysis({ pkgType: '0', pkgId: 32, version: '3.0-1', providedSonames: ['libfoo.so.3'] }),
        analysis({ pkgId: 13, neededSonames: ['libfoo.so.2'] }),
      ],
    });

    const detected = await detector.detectArchTriggers(REPO_ID, [32]);

    expect(detected.get('foo-viewer')).toMatchObject({ ownerId: 32 });
  });

  describe('a package that a change broke after its build', () => {
    const brokenSince = new Date('2026-09-10T00:00:00Z');

    function missedBreakSeed(bumps: { pkgId: number; timestamp: Date }[]) {
      return {
        arch: [archPkg({ id: 1, pkgname: 'python', version: '3.13.1', pkgrel: 1 })],
        chaotic: [chaoticPkg({ id: 14, pkgname: 'python-tool' })],
        analyses: [
          analysis({
            pkgId: 14,
            files: ['usr/lib/python3.12/site-packages/tool/__init__.py'],
            broken: true,
            brokenReasons: ['python 3.12 shipped but python is 3.13'],
            brokenSince,
          }),
        ],
        bumps,
      };
    }

    it('gets a rebuild without a pending change, blamed on the runtime package', async () => {
      const detected = await createDetector(missedBreakSeed([])).detectArchTriggers(REPO_ID, []);

      expect(detected.get('python-tool')).toMatchObject({
        bumpType: BumpType.BROKEN_DEPS,
        triggerFrom: TriggerType.ARCH,
        ownerId: 1,
      });
    });

    it('gets no rebuild when a bump since the break covers it', async () => {
      const bumped = createDetector(missedBreakSeed([{ pkgId: 14, timestamp: new Date('2026-09-11T00:00:00Z') }]));

      expect((await bumped.detectArchTriggers(REPO_ID, [])).size).toBe(0);
    });

    it('gets no rebuild when it was broken as built', async () => {
      const seed = missedBreakSeed([]);
      seed.analyses[0].brokenSince = seed.analyses[0].scannedAt;

      expect((await createDetector(seed).detectArchTriggers(REPO_ID, [])).size).toBe(0);
    });
  });

  it('blames a pkgrel-only Arch rebuild that dropped the Haskell soname a consumer links', async () => {
    const detector = createDetector({
      arch: [archPkg({ id: 40, pkgname: 'haskell-syb', previousVersion: '0.7.4-28', version: '0.7.4', pkgrel: 33 })],
      chaotic: [
        chaoticPkg({
          id: 15,
          pkgname: 'bluespec-git',
          metadata: { buildDate: '0', filename: 'x', deps: ['haskell-syb'] },
        }),
      ],
      analyses: [
        analysis({
          pkgType: '0',
          pkgId: 40,
          version: '0.7.4-28',
          providedSonames: ['libHSsyb-0.7.4-6GzGX-ghc9.6.7.so'],
        }),
        analysis({
          pkgType: '0',
          pkgId: 40,
          version: '0.7.4-33',
          providedSonames: ['libHSsyb-0.7.4-COKSG-ghc9.6.7.so'],
        }),
        analysis({ pkgId: 15, neededSonames: ['libHSsyb-0.7.4-6GzGX-ghc9.6.7.so'] }),
      ],
    });

    const detected = await detector.detectArchTriggers(REPO_ID, [40]);

    expect(detected.get('bluespec-git')).toMatchObject({ bumpType: BumpType.BROKEN_DEPS, ownerId: 40 });
  });

  it('blames the current provider of the library family when no analysis provided the missing soname', async () => {
    const detector = createDetector({
      arch: [archPkg({ id: 41, pkgname: 'haskell-syb', version: '0.7.4', pkgrel: 37 })],
      chaotic: [chaoticPkg({ id: 16, pkgname: 'bluespec-git' })],
      analyses: [
        analysis({
          pkgType: '0',
          pkgId: 41,
          version: '0.7.4-37',
          providedSonames: ['libHSsyb-0.7.4-8qjus-ghc9.6.7.so'],
        }),
        analysis({
          pkgId: 16,
          neededSonames: ['libHSsyb-0.7.4-6GzGX-ghc9.6.7.so'],
          broken: true,
          brokenReasons: ['missing soname libHSsyb-0.7.4-6GzGX-ghc9.6.7.so'],
          brokenSince: new Date('2026-10-12T00:00:00Z'),
        }),
      ],
    });

    const detected = await detector.detectArchTriggers(REPO_ID, []);

    expect(detected.get('bluespec-git')).toMatchObject({ bumpType: BumpType.BROKEN_DEPS, ownerId: 41 });
  });
});

describe('TriggerDetector.detectArchTriggers with strict plugin owners', () => {
  const KWIN_ID = 50;
  const STRICT_OWNERS = ['kwin'];

  function kwinSeed(kwin: Partial<ArchlinuxPackage>, pluginOf: string[] = [`a${KWIN_ID}`]) {
    return {
      arch: [archPkg({ id: KWIN_ID, pkgname: 'kwin', ...kwin })],
      chaotic: [chaoticPkg({ id: 17, pkgname: 'kwin-effects-kinetic' })],
      analyses: [analysis({ pkgId: 17, pluginOf })],
    };
  }

  it('bumps a plugin of a strict owner on a pkgver change without an ABI break', async () => {
    const detector = createDetector(kwinSeed({ previousVersion: '6.5.1-1', version: '6.5.2', pkgrel: 1 }));

    const detected = await detector.detectArchTriggers(REPO_ID, [KWIN_ID], STRICT_OWNERS);

    expect(detected.get('kwin-effects-kinetic')).toEqual({
      bumpType: BumpType.PLUGIN,
      triggerFrom: TriggerType.ARCH,
      ownerId: KWIN_ID,
      reason: 'kwin updated (strict plugin owner)',
      details: ['kwin: 6.5.1-1 -> 6.5.2-1'],
    });
  });

  it('bumps a plugin of a strict owner on a pkgrel-only change', async () => {
    const detector = createDetector(kwinSeed({ previousVersion: '6.5.2-1', version: '6.5.2', pkgrel: 2 }));

    const detected = await detector.detectArchTriggers(REPO_ID, [KWIN_ID], STRICT_OWNERS);

    expect(detected.get('kwin-effects-kinetic')).toMatchObject({ bumpType: BumpType.PLUGIN, ownerId: KWIN_ID });
  });

  it('does not bump when the owner is not in the strict list', async () => {
    const detector = createDetector(kwinSeed({ previousVersion: '6.5.1-1', version: '6.5.2', pkgrel: 1 }));

    const detected = await detector.detectArchTriggers(REPO_ID, [KWIN_ID], []);

    expect(detected.size).toBe(0);
  });

  it('does not bump a package that is not a plugin of the strict owner', async () => {
    const detector = createDetector(kwinSeed({ previousVersion: '6.5.1-1', version: '6.5.2', pkgrel: 1 }, []));

    const detected = await detector.detectArchTriggers(REPO_ID, [KWIN_ID], STRICT_OWNERS);

    expect(detected.size).toBe(0);
  });

  it('does not bump for a strict owner without a previous version', async () => {
    const detector = createDetector(kwinSeed({ previousVersion: null, version: '6.5.2', pkgrel: 1 }));

    const detected = await detector.detectArchTriggers(REPO_ID, [KWIN_ID], STRICT_OWNERS);

    expect(detected.size).toBe(0);
  });
});

describe('TriggerDetector.unanalyzedChaoticIds', () => {
  it('reports a bump rebuild whose release has no analysis, although its pkgver has one', async () => {
    const detector = createDetector({
      arch: [],
      chaotic: [
        chaoticPkg({ id: 20, pkgname: 'bluespec-git', version: 'r1137.d0ecddfd', pkgrel: 1, bump: 2 }),
        chaoticPkg({ id: 21, pkgname: 'up-to-date', version: '1.0', pkgrel: 1, bump: 0 }),
      ],
      analyses: [analysis({ pkgId: 20, version: 'r1137.d0ecddfd-1' }), analysis({ pkgId: 21, version: '1.0-1' })],
    });

    expect(await detector.unanalyzedChaoticIds()).toEqual([20]);
  });
});
