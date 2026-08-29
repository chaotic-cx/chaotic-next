import { type PinoLogger } from 'nestjs-pino';

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;
import { describe, expect, it, vi } from 'vitest';
import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
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
  commitCiConfig?: ReturnType<typeof vi.fn>;
}): {
  service: BuildClassSyncService;
  saveMock: ReturnType<typeof vi.fn>;
  suggestMock: ReturnType<typeof vi.fn>;
  fetchCiConfigMock: ReturnType<typeof vi.fn>;
  commitCiConfigMock: ReturnType<typeof vi.fn>;
} {
  const packages = options?.packages ?? [];
  const findMock = vi.fn().mockResolvedValue(packages);
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const fetchCiConfigMock = vi.fn<(repoName: string, pkgbase: string) => Promise<string | null>>();
  fetchCiConfigMock.mockResolvedValue(options?.configText === undefined ? '' : options.configText);
  const suggestMock = vi.fn();
  suggestMock.mockResolvedValue(options?.suggestions ?? []);
  const commitCiConfigMock = options?.commitCiConfig ?? vi.fn().mockResolvedValue(true);

  const repository = {
    find: findMock,
    findOne: vi.fn().mockResolvedValue(packages[0] ?? null),
    save: saveMock,
  } as never;
  const gitlab = {
    fetchCiConfig: fetchCiConfigMock,
    commitCiConfig: commitCiConfigMock,
  } as unknown as GitlabPipelineService;
  const suggester = { suggestForPackages: suggestMock } as unknown as BuildClassSuggesterService;

  return {
    service: new BuildClassSyncService(repository, gitlab, suggester, pinoStub),
    saveMock,
    suggestMock,
    fetchCiConfigMock,
    commitCiConfigMock,
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
    const logSpy = vi.spyOn(pinoStub, 'info').mockImplementation(() => undefined);
    const pkg = makePackage({});
    const { service, saveMock } = makeService({ packages: [pkg], configText: 'CI_PKGBUILD_SOURCE=aur\n' });

    try {
      await service.syncFromDeployment('chaotic-aur', ['paru']);

      expect(pkg.buildClass).toBe(5);
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ pkgname: 'paru', buildClass: 5 }),
        expect.stringContaining('Updated stored build class'),
      );
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

  it('commits an even class when resource usage suggests a different class', async () => {
    const pkg = makePackage({ buildClass: 8 });
    const { service, commitCiConfigMock, saveMock } = makeService({
      packages: [pkg],
      configText: 'CI_PKGBUILD_SOURCE=aur\nBUILDER_CLASS=8\n',
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 4, samples: 12, averages: {} as never }],
    });

    await service.syncFromDeployment('chaotic-aur', ['paru']);

    expect(commitCiConfigMock).toHaveBeenCalledWith(
      'chaotic-aur',
      'paru',
      'CI_PKGBUILD_SOURCE=aur\nBUILDER_CLASS=4\n',
      expect.stringContaining('Automatic adjustment from 8 to 4'),
    );
    expect(pkg.buildClass).toBe(4);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('snaps an odd suggestion down to the nearest even class', async () => {
    const pkg = makePackage({ buildClass: 2 });
    const { service, commitCiConfigMock } = makeService({
      packages: [pkg],
      configText: 'BUILDER_CLASS=2\n',
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 9, samples: 5, averages: {} as never }],
    });

    await service.syncFromDeployment('chaotic-aur', ['paru']);

    expect(commitCiConfigMock).toHaveBeenCalledWith('chaotic-aur', 'paru', 'BUILDER_CLASS=8\n', expect.any(String));
    expect(pkg.buildClass).toBe(8);
  });

  it('leaves an odd manual class untouched', async () => {
    const pkg = makePackage({ buildClass: 9, pkgbaseName: 'paru' });
    const { service, commitCiConfigMock, saveMock } = makeService({
      packages: [pkg],
      configText: 'BUILDER_CLASS=9\n',
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 4, samples: 12, averages: {} as never }],
    });

    await service.syncFromDeployment('chaotic-aur', ['paru']);

    expect(commitCiConfigMock).not.toHaveBeenCalled();
    expect(pkg.buildClass).toBe(9);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('keeps the stored value when the commit fails', async () => {
    const pkg = makePackage({ buildClass: 8, pkgbaseName: 'paru' });
    const { service, saveMock } = makeService({
      packages: [pkg],
      configText: 'BUILDER_CLASS=8\n',
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 4, samples: 12, averages: {} as never }],
      commitCiConfig: vi.fn().mockResolvedValue(false),
    });

    await service.syncFromDeployment('chaotic-aur', ['paru']);

    expect(pkg.buildClass).toBe(8);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('adjusts one package and reports the outcome', async () => {
    const pkg = makePackage({ buildClass: 8, pkgbaseName: 'paru' });
    const { service, commitCiConfigMock } = makeService({
      packages: [pkg],
      configText: 'BUILDER_CLASS=8\n',
      suggestions: [{ pkgname: 'paru', suggestedBuildClass: 5, samples: 3, averages: {} as never }],
    });

    const result = await service.adjustPackageBuildClass('paru');

    expect(result).toEqual({ pkgname: 'paru', pkgbase: 'paru', buildClass: 4, adjusted: true });
    expect(commitCiConfigMock).toHaveBeenCalledWith('chaotic-aur', 'paru', 'BUILDER_CLASS=4\n', expect.any(String));
    expect(pkg.buildClass).toBe(4);
  });

  it('throws when the adjusted package does not exist', async () => {
    const { service } = makeService();

    await expect(service.adjustPackageBuildClass('ghost')).rejects.toThrow('Package not found: ghost');
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
    const errorSpy = vi.spyOn(pinoStub, 'warn').mockImplementation(() => undefined);
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const findMock = vi
      .fn()
      .mockResolvedValue([makePackage({ pkgname: 'broken-package' }), makePackage({ pkgname: 'healthy-package' })]);
    const fetchCiConfigMock = vi.fn<(repoName: string, pkgbase: string) => Promise<string | null>>();
    fetchCiConfigMock.mockRejectedValueOnce(new Error('gitlab down'));
    fetchCiConfigMock.mockResolvedValue('BUILDER_CLASS=3\n');

    const gitlab = { fetchCiConfig: fetchCiConfigMock } as unknown as GitlabPipelineService;
    const suggester = { suggestForPackages: vi.fn().mockResolvedValue([]) } as unknown as BuildClassSuggesterService;
    const service = new BuildClassSyncService({ find: findMock, save: saveMock } as never, gitlab, suggester, pinoStub);

    try {
      await service.syncFromDeployment('chaotic-aur', ['broken-package', 'healthy-package']);

      expect(fetchCiConfigMock).toHaveBeenCalledTimes(2);
      expect(saveMock).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
