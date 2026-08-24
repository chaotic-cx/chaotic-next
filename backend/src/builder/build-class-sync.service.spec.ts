import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GitlabService } from '../gitlab/gitlab.service';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { BuildClassSyncService, parseConfiguredBuildClass } from './build-class-sync.service';
import type { Package } from './builder.entity';

function makePackage(overrides: Partial<Package>): Package {
  return {
    id: 1,
    pkgname: 'paru',
    isActive: true,
    buildClass: null,
    repo: { id: 1, name: 'chaotic-aur' } as Package['repo'],
    ...overrides,
  } as Package;
}

function makeService(options?: {
  packages?: Package[];
  configText?: string | null;
  suggestions?: Awaited<ReturnType<BuildClassSuggesterService['suggestForPackages']>>;
}): {
  service: BuildClassSyncService;
  saveMock: ReturnType<typeof vi.fn>;
  suggestMock: ReturnType<typeof vi.fn>;
  fetchCiConfigMock: ReturnType<typeof vi.fn>;
} {
  const packages = options?.packages ?? [];
  const findMock = vi.fn().mockResolvedValue(packages);
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const fetchCiConfigMock = vi.fn<(repoName: string, pkgbase: string) => Promise<string | null>>();
  fetchCiConfigMock.mockResolvedValue(options?.configText === undefined ? '' : options.configText);
  const suggestMock = vi.fn();
  suggestMock.mockResolvedValue(options?.suggestions ?? []);

  const repository = { find: findMock, save: saveMock } as never;
  const gitlab = { fetchCiConfig: fetchCiConfigMock } as unknown as GitlabService;
  const suggester = { suggestForPackages: suggestMock } as unknown as BuildClassSuggesterService;

  return {
    service: new BuildClassSyncService(repository, gitlab, suggester),
    saveMock,
    suggestMock,
    fetchCiConfigMock,
  };
}

describe('parseConfiguredBuildClass', () => {
  it('reads BUILDER_CLASS from the CI config', () => {
    expect(parseConfiguredBuildClass('CI_PKGBUILD_SOURCE=aur\nBUILDER_CLASS=9\n')).toBe(9);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseConfiguredBuildClass('CI_PKGBUILD_SOURCE=aur')).toBeNull();
    expect(parseConfiguredBuildClass('BUILDER_CLASS=heavy')).toBeNull();
    expect(parseConfiguredBuildClass('BUILDER_CLASS=99')).toBeNull();
  });
});

describe('BuildClassSyncService', () => {
  it('persists the configured build class and stamps the pkgbase', async () => {
    const pkg = makePackage({});
    const { service, saveMock } = makeService({ packages: [pkg], configText: 'BUILDER_CLASS=5\n' });

    await service.syncFromDeployment('chaotic-aur', ['paru']);

    expect(pkg.buildClass).toBe(5);
    expect(pkg.pkgbaseName).toBe('paru');
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('applies the default class when no BUILDER_CLASS is configured', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pkg = makePackage({});
    const { service, saveMock } = makeService({ packages: [pkg], configText: 'CI_PKGBUILD_SOURCE=aur\n' });

    try {
      await service.syncFromDeployment('chaotic-aur', ['paru']);

      expect(pkg.buildClass).toBe(5);
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Updated stored build class of paru to 5'));
    } finally {
      logSpy.mockRestore();
    }
  });

  it('keeps the stored value when everything already matches', async () => {
    const pkg = makePackage({ buildClass: 5, pkgbaseName: 'paru' });
    const { service, saveMock } = makeService({ packages: [pkg], configText: 'BUILDER_CLASS=5\n' });

    await service.syncFromDeployment('chaotic-aur', ['paru']);

    expect(saveMock).not.toHaveBeenCalled();
  });

  it('applies one config fetch to all split package members of a pkgbase', async () => {
    const pkgbaseRow = makePackage({ id: 1, pkgname: 'wps-office-cn' });
    const mimeMember = makePackage({ id: 2, pkgname: 'wps-office-mime-cn', pkgbaseName: 'wps-office-cn' });
    const { service, saveMock, suggestMock } = makeService({
      packages: [pkgbaseRow, mimeMember],
      configText: 'BUILDER_CLASS=9\n',
    });

    await service.syncFromDeployment('chaotic-aur', ['wps-office-cn']);

    expect(pkgbaseRow.buildClass).toBe(9);
    expect(mimeMember.buildClass).toBe(9);
    expect(mimeMember.pkgbaseName).toBe('wps-office-cn');
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(suggestMock).toHaveBeenCalledWith(['wps-office-cn']);
  });

  it('reads the shared pkgbase config during a full rescan of a member package', async () => {
    const member = makePackage({ id: 2, pkgname: 'wps-office-mime-cn', pkgbaseName: 'wps-office-cn' });
    const { service, fetchCiConfigMock } = makeService({ packages: [member], configText: 'BUILDER_CLASS=2\n' });

    await service.rescanAllPackages();

    expect(fetchCiConfigMock).toHaveBeenCalledWith('chaotic-aur', 'wps-office-cn');
    expect(member.buildClass).toBe(2);
  });

  it('warns instead of adjusting when resource usage suggests another class', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const pkg = makePackage({});
    const { service, saveMock } = makeService({
      packages: [pkg],
      configText: 'BUILDER_CLASS=1\n',
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 8, samples: 12, averages: {} as never }],
    });

    try {
      await service.syncFromDeployment('chaotic-aur', ['paru']);

      expect(pkg.buildClass).toBe(1);
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('resource usage suggests 8'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('skips work without package names or without a CI config file', async () => {
    const emptyRun = makeService();
    await emptyRun.service.syncFromDeployment('chaotic-aur', []);
    expect(emptyRun.saveMock).not.toHaveBeenCalled();

    const noFileRun = makeService({
      packages: [makePackage({})],
      configText: null,
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 8, samples: 12, averages: {} as never }],
    });
    await noFileRun.service.syncFromDeployment('chaotic-aur', ['paru']);
    expect(noFileRun.suggestMock).not.toHaveBeenCalled();
    expect(noFileRun.saveMock).not.toHaveBeenCalled();
  });

  it('continues with other packages when one fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const findMock = vi
      .fn()
      .mockResolvedValue([makePackage({ pkgname: 'broken-package' }), makePackage({ pkgname: 'healthy-package' })]);
    const fetchCiConfigMock = vi.fn<(repoName: string, pkgbase: string) => Promise<string | null>>();
    fetchCiConfigMock.mockRejectedValueOnce(new Error('gitlab down'));
    fetchCiConfigMock.mockResolvedValue('BUILDER_CLASS=3\n');

    const gitlab = { fetchCiConfig: fetchCiConfigMock } as unknown as GitlabService;
    const suggester = { suggestForPackages: vi.fn().mockResolvedValue([]) } as unknown as BuildClassSuggesterService;
    const service = new BuildClassSyncService({ find: findMock, save: saveMock } as never, gitlab, suggester);

    try {
      await service.syncFromDeployment('chaotic-aur', ['broken-package', 'healthy-package']);

      expect(fetchCiConfigMock).toHaveBeenCalledTimes(2);
      expect(saveMock).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
