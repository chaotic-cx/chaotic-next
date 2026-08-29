import { describe, expect, it, vi, type Mock } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { Package, Repo } from '../builder/builder.entity';
import { EntityLookupService } from '../builder/entity-lookup.service';
import { ArchMirrorService } from './arch-mirror.service';
import { ChaoticIndexService, deactivateMissing, findDuplicateInactiveRows, markActive } from './chaotic-index.service';
import { SignalScanService } from './scan';

function repo(name: string): Repo {
  return { name } as Repo;
}

function pkg(overrides: Record<string, unknown>): Package {
  return {
    id: 0,
    pkgname: 'pkg',
    isActive: true,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    removedAt: null,
    ...overrides,
  } as unknown as Package;
}

const FIXED_NOW = '2026-08-19T00:00:00.000Z';

describe('deactivateMissing', () => {
  it('marks missing active packages inactive and stamps removedAt', () => {
    const present = pkg({ id: 1, pkgname: 'present', repo: repo('chaotic-aur') });
    const removed = pkg({ id: 2, pkgname: 'removed', repo: repo('chaotic-aur') });
    const currentKeys = new Set(['chaotic-aur:present']);

    const result = deactivateMissing([present, removed], currentKeys, () => new Date(FIXED_NOW));

    expect(result).toEqual([removed]);
    expect(removed.isActive).toBe(false);
    expect(removed.removedAt).toBe(FIXED_NOW);
    expect(present.isActive).toBe(true);
    expect(present.removedAt).toBeNull();
  });

  it('does not touch already-inactive packages or their removal time', () => {
    const alreadyRemoved = pkg({ id: 1, pkgname: 'gone', isActive: false, removedAt: '2026-01-01T00:00:00.000Z' });
    const currentKeys = new Set<string>([]);

    const result = deactivateMissing([alreadyRemoved], currentKeys, () => new Date(FIXED_NOW));

    expect(result).toEqual([]);
    expect(alreadyRemoved.removedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('leaves lastUpdated untouched when deactivating', () => {
    const removed = pkg({
      id: 1,
      pkgname: 'removed',
      repo: repo('chaotic-aur'),
      lastUpdated: '2026-07-15T00:00:00.000Z',
    });
    const currentKeys = new Set<string>([]);

    deactivateMissing([removed], currentKeys, () => new Date(FIXED_NOW));

    expect(removed.isActive).toBe(false);
    expect(removed.removedAt).toBe(FIXED_NOW);
    expect(removed.lastUpdated).toBe('2026-07-15T00:00:00.000Z');
  });
});

describe('markActive', () => {
  it('reactivates a package and clears its removal time', () => {
    const p = pkg({ id: 1, pkgname: 'back', isActive: false, removedAt: '2026-01-01T00:00:00.000Z' });

    markActive(p);

    expect(p.isActive).toBe(true);
    expect(p.removedAt).toBeNull();
  });

  it('leaves lastUpdated untouched when reactivating', () => {
    const p = pkg({ id: 1, pkgname: 'back', isActive: false, lastUpdated: '2026-07-15T00:00:00.000Z' });

    markActive(p);

    expect(p.isActive).toBe(true);
    expect(p.lastUpdated).toBe('2026-07-15T00:00:00.000Z');
  });
});

describe('updateChaoticDatabaseVersions', () => {
  function buildService(pullImpl: () => Promise<unknown>): { service: ChaoticIndexService; save: Mock; find: Mock } {
    const packagesRepository = { find: vi.fn(), save: vi.fn() };
    const archMirror = { pullDatabases: vi.fn().mockImplementation(pullImpl), cleanUp: vi.fn() };
    const service = new ChaoticIndexService(
      archMirror as unknown as ArchMirrorService,
      packagesRepository as unknown as Repository<Package>,
      { find: vi.fn() } as unknown as Repository<Repo>,
      {} as SignalScanService,
      {} as EntityLookupService,
      { info: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as PinoLogger,
    );
    return { service, save: packagesRepository.save, find: packagesRepository.find };
  }

  it('aborts without deactivating anything when a database pull fails', async () => {
    const { service, save, find } = buildService(() => Promise.resolve(null));
    const repo = { name: 'chaotic-aur', dbPath: 'chaotic-aur.files' } as Repo;

    await expect(service.updateChaoticDatabaseVersions([repo])).rejects.toThrow();

    expect(save).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('aborts when a database pull rejects', async () => {
    const { service, save } = buildService(() => Promise.reject(new Error('download failed')));
    const repo = { name: 'chaotic-aur', dbPath: 'chaotic-aur.files' } as Repo;

    await expect(service.updateChaoticDatabaseVersions([repo])).rejects.toThrow('download failed');

    expect(save).not.toHaveBeenCalled();
  });
});

describe('findDuplicateInactiveRows', () => {
  it('flags an inactive version-less row whose pkgname is active in another repo', () => {
    const active = pkg({ id: 1, pkgname: 'obs-pipewire', repo: repo('chaotic-aur'), version: '1.2.1' });
    const duplicate = pkg({ id: 2, pkgname: 'obs-pipewire', repo: repo('garuda'), isActive: false, version: null });

    const result = findDuplicateInactiveRows([active, duplicate]);

    expect(result).toEqual([duplicate]);
  });

  it('does not flag active rows, versioned inactive rows, or unique inactive rows', () => {
    const active = pkg({ id: 1, pkgname: 'foo', repo: repo('chaotic-aur'), version: '1.0.0' });
    // Versioned inactive row: keep (real removal history).
    const versionedInactive = pkg({ id: 2, pkgname: 'foo', repo: repo('garuda'), isActive: false, version: '1.0.0' });
    // Unique inactive row with no active counterpart: keep.
    const uniqueInactive = pkg({
      id: 3,
      pkgname: 'only-here',
      repo: repo('chaotic-aur'),
      isActive: false,
      version: null,
    });
    // Active row itself: keep.
    const otherActive = pkg({ id: 4, pkgname: 'bar', repo: repo('chaotic-aur'), version: '2.0.0' });

    const result = findDuplicateInactiveRows([active, versionedInactive, uniqueInactive, otherActive]);

    expect(result).toEqual([]);
  });
});
