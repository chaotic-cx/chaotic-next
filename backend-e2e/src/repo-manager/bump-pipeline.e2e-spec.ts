/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures assert on freshly created entities */
import { BumpService } from '@chaotic-next/backend/repo-manager/bump';
import { RepoReader, RepoWriter } from '@chaotic-next/backend/repo-manager/repo-rw';
import { ArchMirrorService } from '@chaotic-next/backend/repo-manager/arch-mirror.service';
import { ChaoticIndexService } from '@chaotic-next/backend/repo-manager/chaotic-index.service';
import { RebuildTriggerService, SignalScanService } from '@chaotic-next/backend/repo-manager/scan';
import {
  ArchlinuxPackage,
  PackageBump,
  PackageElfAnalysis,
} from '@chaotic-next/backend/repo-manager/repo-manager.entity';
import { RepoManager } from '@chaotic-next/backend/repo-manager/repo-manager';
import { encodeOwnerKey } from '@chaotic-next/backend/repo-manager/signal';
import { Package } from '@chaotic-next/backend/builder/builder.entity';
import {
  BumpType,
  RepoSettings,
  RepoUpdateRunParams,
  TriggerType,
} from '@chaotic-next/backend/interfaces/repo-manager';
import { HttpService } from '@nestjs/axios';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('Bump pipeline (e2e, real PostgreSQL)', () => {
  let e2e: E2eApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    e2e = await createE2eApp();
    dataSource = e2e.dataSource;
  });

  afterAll(async () => {
    await e2e?.close();
  });

  beforeEach(async () => {
    await e2e.resetTables();
  });

  function fakeReader(files: Record<string, string>): RepoReader {
    const map = new Map(Object.entries(files));
    return {
      listPackageDirs: async () =>
        [...new Set([...map.keys()].map((k) => k.split('/')[0]))].filter((d) => d && !d.startsWith('.')),
      readFile: async (path) => map.get(path) ?? '',
      dispose: async () => undefined,
    };
  }

  function makeOrchestrator(opts: {
    writer: RepoWriter;
    reader: RepoReader;
    signalScanEnabled?: boolean;
  }): RepoManager {
    const repoSettings = {
      regenDatabase: false,
      abiDryRun: false,
      mirrorUrl: '',
      signalScanEnabled: opts.signalScanEnabled ?? false,
    } as unknown as RepoSettings;
    const bump = makeBumpService(opts.writer);
    const triggers = new RebuildTriggerService(
      dataSource.getRepository(PackageElfAnalysis),
      dataSource.getRepository(ArchlinuxPackage),
      dataSource.getRepository(Package),
      bump,
    );
    return new RepoManager(
      repoSettings,
      {} as HttpService,
      { open: async () => opts.reader },
      {} as SignalScanService,
      dataSource.getRepository(Package),
      {} as ArchMirrorService,
      {} as ChaoticIndexService,
      triggers,
      bump,
    );
  }

  function makeBumpService(writer: RepoWriter): BumpService {
    return new BumpService(dataSource.getRepository(Package), dataSource.getRepository(PackageElfAnalysis), writer);
  }

  it('executes a BROKEN_DEPS verdict: persists the PackageBump row and commits a surgically-rewritten config', async () => {
    const repo = await e2e.seedRepo({ name: 'chaotic-aur', gitlabProjectId: '42' });
    const glibc = await e2e.seedArchlinuxPackage({ pkgname: 'glibc', version: '2.42-1' });
    const consumer = await e2e.seedPackage({
      pkgname: 'mesa-tkg-git',
      version: '26.2.0_devel.221337.b860e0132f9',
      pkgrel: 1,
      repo,
    });

    // Real .CI/config from pkgbuilds/mesa-tkg-git — only the bump line may change.
    const config =
      [
        'CI_ON_TRIGGER=daily',
        'BUILDER_CACHE_SOURCES=true',
        'CI_PACKAGE_BUMP=26.2.0_devel.221337.b860e0132f9-1/1',
        'CI_REBUILD_TRIGGERS=libxml2:libdisplay-info',
        'CI_PKGBUILD_SOURCE=https://github.com/Frogging-Family/mesa-git.git',
      ].join('\n') + '\n';
    const reader = fakeReader({ 'mesa-tkg-git/.CI/config': config });
    const commitBumps = vi.fn().mockResolvedValue(undefined);
    const bumpService = makeBumpService({ commitBumps });

    const needsRebuild: RepoUpdateRunParams[] = [
      {
        archPkg: glibc,
        bumpType: BumpType.BROKEN_DEPS,
        configs: {},
        pkg: consumer,
        triggerFrom: TriggerType.ARCH,
        details: ['libfoo.so.6 missing'],
      },
    ];

    await bumpService.bumpPackages(needsRebuild, reader);
    const needsPush = needsRebuild.filter((p) => p.gotBumped === true);
    await bumpService.pushChanges(needsPush, repo);

    const bumps = await dataSource.getRepository(PackageBump).find({ relations: { pkg: true } });
    const bump = bumps.find((b) => b.pkg?.id === consumer.id);
    expect(bump).toBeDefined();
    expect(bump!.bumpType).toBe(BumpType.BROKEN_DEPS);
    expect(bump!.trigger).toBe(glibc.id);
    expect(bump!.triggerFrom).toBe(TriggerType.ARCH);

    expect(commitBumps).toHaveBeenCalledTimes(1);
    const [repoArg, actions] = commitBumps.mock.calls[0];
    expect(repoArg.gitlabProjectId).toBe('42');
    expect(actions).toHaveLength(1);
    expect(actions[0].pkgname).toBe('mesa-tkg-git');
    // Same base → counter 1→2; every other line preserved byte-for-byte.
    expect(actions[0].content).toBe(
      config.replace(
        'CI_PACKAGE_BUMP=26.2.0_devel.221337.b860e0132f9-1/1',
        'CI_PACKAGE_BUMP=26.2.0_devel.221337.b860e0132f9-1/2',
      ),
    );
    expect(actions[0].bumpType).toBe(BumpType.BROKEN_DEPS);
  });

  it('does NOT bump on EXPLICIT triggers via startRun: CI_REBUILD_TRIGGERS are handled by the pkgbuilds CI', async () => {
    const repo = await e2e.seedRepo({ name: 'chaotic-aur', gitlabProjectId: '42' });
    const boost = await e2e.seedArchlinuxPackage({ pkgname: 'boost', version: '1.86.0-1' });
    const consumer = await e2e.seedPackage({
      pkgname: 'kicad-git',
      version: '10.99.0.r2148.g26c2468',
      pkgrel: 1,
      repo,
    });

    // Real .CI/config from pkgbuilds/kicad-git — CI_REBUILD_TRIGGERS includes boost.
    const reader = fakeReader({ 'kicad-git/.CI/config': 'CI_REBUILD_TRIGGERS=boost:poppler:protobuf\n' });
    const commitBumps = vi.fn().mockResolvedValue(undefined);
    const repoManager = makeOrchestrator({ writer: { commitBumps }, reader });
    repoManager.changedArchPackages = [boost];

    const result = await repoManager.startRun(repo);

    expect(result.bumped).toHaveLength(0);
    expect(commitBumps).not.toHaveBeenCalled();

    const bumps = await dataSource.getRepository(PackageBump).find({ relations: { pkg: true } });
    expect(bumps.some((b) => b.pkg?.id === consumer.id)).toBe(false);
  });

  it('startRun bumps a plugin package on a real kwin ABI break and commits CI_PACKAGE_BUMP ABOVE CI_REBUILD_TRIGGERS', async () => {
    // Fabricate realistic Arch updates by dumping them into the DB via SQL:
    // kwin 6.7.3 -> 6.7.4 (drops exported symbols), new versions of bluespec-git's
    // haskell deps, and ffmpeg 8. The consumer configs are the real test-repo
    // ones minus their CI_PACKAGE_BUMP line, so the bump has to INSERT the line
    // above CI_REBUILD_TRIGGERS (the wsjtx-improved-qt6 ordering bug).
    const repo = await e2e.seedRepo({ name: 'chaotic-aur', gitlabProjectId: '42' });

    const kwin = await dataSource.query(
      `INSERT INTO archlinux_package ("pkgname", "version", "pkgrel", "arch", "previousVersion", "metadata")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      ['kwin', '6.7.4', 4, 'x86_64', '6.7.3', '{}'],
    );
    const kwinId = kwin[0].id as number;

    for (const [name, prev, next] of [
      ['haskell-old-time', '1.1.1.0', '1.1.1.1'],
      ['haskell-syb', '0.7.4', '0.7.5'],
      ['haskell-regex-compat', '0.95.2.2', '0.95.2.3'],
      ['haskell-split', '0.2.5', '0.2.6'],
      ['ffmpeg', '7.1-1', '8.0-1'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO archlinux_package ("pkgname", "version", "pkgrel", "arch", "previousVersion", "metadata")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [name, next, 1, 'x86_64', prev, '{}'],
      );
    }

    // The 4 exported symbols kwin 6.7.0 -> 6.7.4 dropped (verified in scan.spec).
    const kwinDropped = [
      '_ZN4KWin10EglBackend25destroyGlobalShareContextEv',
      '_ZN4KWin10EglBackend8teardownEv',
      '_ZNK4KWin12VulkanDevice13transferQueueEv',
      '_ZNK4KWin12VulkanDevice19transferQueueFamilyEv',
    ];
    await dataSource.query(
      `INSERT INTO package_elf_analysis ("pkgType", "pkgId", "version", "files", "neededSonames", "providedSonames", "importedSymbols", "exportedSymbols", "pluginOf")
       VALUES ('0', $1, '6.7.3', $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [
        kwinId,
        '["usr/lib/libkwin.so.6.7.3"]',
        '["libc.so.6","libQt6Core.so.6"]',
        '["libkwin.so.6"]',
        '[]',
        JSON.stringify({
          'libkwin.so.6': ['_ZN4KWin6Effect14tabletToolAxisEPNS_19TabletToolAxisEventE', ...kwinDropped],
        }),
        '[]',
      ],
    );
    await dataSource.query(
      `INSERT INTO package_elf_analysis ("pkgType", "pkgId", "version", "files", "neededSonames", "providedSonames", "importedSymbols", "exportedSymbols", "pluginOf")
       VALUES ('0', $1, '6.7.4', $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [
        kwinId,
        '["usr/lib/libkwin.so.6.7.4"]',
        '["libc.so.6","libQt6Core.so.6"]',
        '["libkwin.so.6"]',
        '[]',
        JSON.stringify({ 'libkwin.so.6': ['_ZN4KWin6Effect14tabletToolAxisEPNS_19TabletToolAxisEventE'] }),
        '[]',
      ],
    );

    const betterBlur = await dataSource.query(
      `INSERT INTO package ("pkgname", "version", "isActive", "skipSignalScan", "pkgrel", "lastUpdated", "repoId", "metadata")
       VALUES ($1, $2, true, false, 1, $3, $4, $5::jsonb) RETURNING id`,
      ['kwin-effects-better-blur-dx', '2.5.1', new Date().toISOString(), repo.id, '{}'],
    );
    const betterBlurId = betterBlur[0].id as number;
    await dataSource.query(
      `INSERT INTO package_elf_analysis ("pkgType", "pkgId", "version", "files", "neededSonames", "providedSonames", "importedSymbols", "exportedSymbols", "pluginOf")
       VALUES ('1', $1, '2.5.1', $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [
        betterBlurId,
        '["usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so"]',
        '["libkwin.so.6","libc.so.6","libstdc++.so.6"]',
        '[]',
        JSON.stringify([kwinDropped[0], '_ZN4KWin6Effect14tabletToolAxisEPNS_19TabletToolAxisEventE', 'malloc']),
        '{}',
        JSON.stringify([encodeOwnerKey(TriggerType.ARCH, kwinId)]),
      ],
    );

    await dataSource.query(
      `INSERT INTO package ("pkgname", "version", "isActive", "skipSignalScan", "pkgrel", "lastUpdated", "repoId", "metadata")
       VALUES ($1, $2, true, false, 1, $3, $4, $5::jsonb)`,
      ['bluespec-git', 'r1127.941eecfe', new Date().toISOString(), repo.id, '{}'],
    );

    // Real .CI/config files from pkgbuilds (bump line omitted to force insertion-above).
    const reader = fakeReader({
      'kwin-effects-better-blur-dx/.CI/config': 'CI_REBUILD_TRIGGERS=kwin\nCI_PKGBUILD_SOURCE=aur\n',
      'bluespec-git/.CI/config':
        'CI_REBUILD_TRIGGERS=haskell-old-time:haskell-syb:haskell-regex-compat:haskell-split\nCI_PKGBUILD_SOURCE=aur\n',
    });
    const commitBumps = vi.fn().mockResolvedValue(undefined);
    const repoManager = makeOrchestrator({
      writer: { commitBumps },
      reader,
      signalScanEnabled: true,
    });
    const changed = await dataSource.getRepository(ArchlinuxPackage).find();
    repoManager.changedArchPackages = changed;

    const result = await repoManager.startRun(repo);

    expect(result.bumped.map((entry) => entry.pkg.pkgname)).toContain('kwin-effects-better-blur-dx');
    expect(commitBumps).toHaveBeenCalledTimes(1);
    const [repoArg, actions] = commitBumps.mock.calls[0];
    expect(repoArg.gitlabProjectId).toBe('42');
    expect(actions).toHaveLength(1);
    expect(actions[0].pkgname).toBe('kwin-effects-better-blur-dx');
    expect(actions[0].bumpType).toBe(BumpType.PLUGIN);
    expect(actions[0].content).toBe(
      ['CI_PACKAGE_BUMP=2.5.1-1/1', 'CI_REBUILD_TRIGGERS=kwin', 'CI_PKGBUILD_SOURCE=aur'].join('\n') + '\n',
    );
    const committedLines = actions[0].content.split('\n');
    expect(committedLines.indexOf('CI_PACKAGE_BUMP=2.5.1-1/1')).toBeLessThan(
      committedLines.indexOf('CI_REBUILD_TRIGGERS=kwin'),
    );

    const bumps = await dataSource.getRepository(PackageBump).find({ relations: { pkg: true } });
    const bump = bumps.find((b) => b.pkg?.id === betterBlurId);
    expect(bump).toBeDefined();
    expect(bump!.bumpType).toBe(BumpType.PLUGIN);
    expect(bump!.trigger).toBe(kwinId);
    expect(bump!.triggerFrom).toBe(TriggerType.ARCH);
  });
});
