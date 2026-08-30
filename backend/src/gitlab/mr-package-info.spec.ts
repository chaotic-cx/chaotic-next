import { describe, expect, it, vi } from 'vitest';
import {
  fetchPackageInfo,
  parseManageAur,
  parseNvchecker,
  parsePkgbuildSource,
  parseRebuildTriggers,
} from './mr-package-info';

describe('mr-package-info', () => {
  describe('parsePkgbuildSource', () => {
    it('parses the CI_PKGBUILD_SOURCE value', () => {
      expect(parsePkgbuildSource('CI_PKGBUILD_SOURCE=aur\nCI_PACKAGE_BUMP=1.0-1/1\n')).toBe('aur');
      expect(parsePkgbuildSource('CI_PKGBUILD_SOURCE=custom\n')).toBe('custom');
      expect(parsePkgbuildSource('CI_PKGBUILD_SOURCE=https://github.com/x/y.git\n')).toBe('https://github.com/x/y.git');
    });

    it('returns an empty string when the key is absent', () => {
      expect(parsePkgbuildSource('CI_PACKAGE_BUMP=1.0-1/1\n')).toBe('');
    });
  });

  describe('parseManageAur', () => {
    it('is true only when CI_MANAGE_AUR is set to true', () => {
      expect(parseManageAur('CI_MANAGE_AUR=true\n')).toBe(true);
      expect(parseManageAur('CI_MANAGE_AUR=false\n')).toBe(false);
      expect(parseManageAur('CI_PACKAGE_BUMP=1.0-1/1\n')).toBe(false);
    });
  });

  describe('parseNvchecker', () => {
    it('is true only when CI_NVCHECKER is set to true', () => {
      expect(parseNvchecker('CI_NVCHECKER=true\n')).toBe(true);
      expect(parseNvchecker('CI_NVCHECKER=false\n')).toBe(false);
      expect(parseNvchecker('CI_PACKAGE_BUMP=1.0-1/1\n')).toBe(false);
    });
  });

  describe('parseRebuildTriggers', () => {
    it('splits colon-separated triggers and trims', () => {
      expect(parseRebuildTriggers('CI_REBUILD_TRIGGERS=boost:protobuf:poppler\n')).toEqual([
        'boost',
        'protobuf',
        'poppler',
      ]);
      expect(parseRebuildTriggers('CI_REBUILD_TRIGGERS=libxml2\n')).toEqual(['libxml2']);
    });

    it('returns an empty list when absent or empty', () => {
      expect(parseRebuildTriggers('CI_PACKAGE_BUMP=1.0-1/1\n')).toEqual([]);
      expect(parseRebuildTriggers('CI_REBUILD_TRIGGERS=\n')).toEqual([]);
    });
  });

  describe('fetchPackageInfo', () => {
    it('collects ci files and the pkgbuild source from the repo', async () => {
      const api = {
        Repositories: {
          allRepositoryTrees: vi
            .fn()
            .mockResolvedValue([{ name: 'config' }, { name: 'info' }, { name: 'PKGBUILD.append' }]),
        },
        RepositoryFiles: {
          showRaw: vi
            .fn()
            .mockResolvedValue(
              'CI_PKGBUILD_SOURCE=custom\nCI_MANAGE_AUR=true\nCI_NVCHECKER=true\nCI_REBUILD_TRIGGERS=boost:protobuf\n',
            ),
        },
      };

      const info = await fetchPackageInfo(api as never, 'project', 'foo');

      expect(api.Repositories.allRepositoryTrees).toHaveBeenCalledWith('project', {
        path: 'foo/.CI',
        recursive: false,
        ref: 'main',
        pagination: 'keyset',
        orderBy: 'name',
        sort: 'asc',
      });
      expect(info).toEqual({
        pkgname: 'foo',
        ciFiles: ['config', 'info', 'PKGBUILD.append'],
        pkgbuildSource: 'custom',
        manageAur: true,
        nvchecker: true,
        rebuildTriggers: ['boost', 'protobuf'],
      });
    });

    it('returns null when the .CI folder cannot be read', async () => {
      const api = {
        Repositories: { allRepositoryTrees: vi.fn().mockRejectedValue(new Error('404')) },
      };
      const info = await fetchPackageInfo(api as never, 'project', 'missing');
      expect(info).toBeNull();
    });

    it('tolerates a missing config file', async () => {
      const api = {
        Repositories: {
          allRepositoryTrees: vi.fn().mockResolvedValue([{ name: 'info' }]),
        },
        RepositoryFiles: { showRaw: vi.fn().mockRejectedValue(new Error('404')) },
      };
      const info = await fetchPackageInfo(api as never, 'project', 'foo');
      expect(info?.ciFiles).toEqual(['info']);
      expect(info?.pkgbuildSource).toBe('');
      expect(info?.manageAur).toBe(false);
    });
  });
});
