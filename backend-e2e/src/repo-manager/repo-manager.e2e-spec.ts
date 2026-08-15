import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';
import { ELF_ANALYSES, BROKEN_ELF_ANALYSIS } from '../test/fixtures';
import { TriggerType } from '@chaotic-next/backend/interfaces/repo-manager';
import { pkgTypeOf } from '@chaotic-next/backend/repo-manager/signal';

describe('Repo-manager endpoints (e2e, real PostgreSQL)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  beforeEach(async () => {
    await e2e.resetTables();
  });

  describe('POST /repo/signals/import', () => {
    it('imports ELF analyses with numeric pkgId and returns 201', async () => {
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'acl', version: '2.4.0-2' });

      const seed = [
        {
          pkgType: pkgTypeOf(TriggerType.ARCH),
          pkgId: archPkg.id,
          version: '2.4.0',
          files: ['usr/lib/libacl.so.1', 'usr/bin/chacl', 'usr/bin/getfacl', 'usr/bin/setfacl'],
          neededSonames: ['libacl.so.1', 'libc.so.6'],
          providedSonames: ['libacl.so.1'],
          importedSymbols: ['acl_get_perm', 'acl_init', 'malloc'],
          exportedSymbols: { 'libacl.so.1': ['acl_get_entry', 'acl_valid', 'acl_create_entry'] },
          vtables: {},
          directoriesOwned: ['usr/bin', 'usr/include/acl', 'usr/lib', 'usr/share/doc/acl'],
          directDirectories: ['usr/lib'],
          pluginOf: [],
        },
      ];

      const res = await e2e.inject({
        method: 'POST',
        url: '/repo/signals/import',
        payload: seed,
      });

      expect(res.statusCode).toBe(201);

      const rows = (await e2e.dataSource.query(
        `SELECT "pkgType", "pkgId", version FROM package_elf_analysis WHERE "pkgId" = $1`,
        [archPkg.id],
      )) as Array<{ pkgType: string; pkgId: string; version: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe('2.4.0');
    });

    it('is idempotent — re-importing the same (pkgType, pkgId, version) upserts', async () => {
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'attr', version: '2.6.0-1' });

      const seed = [
        {
          pkgType: pkgTypeOf(TriggerType.ARCH),
          pkgId: archPkg.id,
          version: '2.6.0',
          files: ['usr/lib/libattr.so.1'],
          neededSonames: ['libattr.so.1', 'libc.so.6'],
          providedSonames: ['libattr.so.1'],
          importedSymbols: [],
          exportedSymbols: {},
          vtables: {},
          directoriesOwned: ['usr/bin', 'usr/include/attr', 'usr/lib'],
          directDirectories: [],
          pluginOf: [],
        },
      ];

      await e2e.inject({ method: 'POST', url: '/repo/signals/import', payload: seed });
      await e2e.inject({ method: 'POST', url: '/repo/signals/import', payload: seed });

      const rows = (await e2e.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM package_elf_analysis WHERE "pkgId" = $1`,
        [archPkg.id],
      )) as Array<{ count: number }>;
      expect(rows[0].count).toBe(1);
    });
  });

  describe('GET /repo/signals/export', () => {
    it('returns all stored ELF analyses', async () => {
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'acl', version: '2.4.0-2' });
      await e2e.seedElfAnalysis({
        pkgId: archPkg.id,
        version: '2.4.0',
        neededSonames: [...ELF_ANALYSES[0].neededSonames],
        providedSonames: [...ELF_ANALYSES[0].providedSonames],
      });

      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/repo/signals/export' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it('returns an empty array when no analyses exist', async () => {
      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/repo/signals/export' });
      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('GET /repo/broken', () => {
    it('returns packages flagged as broken', async () => {
      // /repo/broken only reports Chaotic analyses; Arch packages are reference
      // data and are never judged broken.
      await e2e.seedElfAnalysis({
        pkgType: pkgTypeOf(TriggerType.CHAOTIC),
        version: BROKEN_ELF_ANALYSIS.version,
        neededSonames: [...BROKEN_ELF_ANALYSIS.neededSonames],
        providedSonames: [...BROKEN_ELF_ANALYSIS.providedSonames],
        broken: true,
        brokenReasons: [...BROKEN_ELF_ANALYSIS.brokenReasons],
      });
      const archOk = await e2e.seedArchlinuxPackage({ pkgname: 'acl' });
      await e2e.seedElfAnalysis({ pkgId: archOk.id, version: '2.4.0', broken: false });

      const res = await e2e.inject<{ items: unknown[] }>({ method: 'GET', url: '/repo/broken' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('returns an empty array when nothing is broken', async () => {
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'acl' });
      await e2e.seedElfAnalysis({ pkgId: archPkg.id, version: '2.4.0', broken: false });

      const res = await e2e.inject<{ items: unknown[] }>({ method: 'GET', url: '/repo/broken' });
      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
    });
  });

  describe('GET /repo/dependencies', () => {
    it('returns dependency edges for packages with provided/needed sonames', async () => {
      const aclPkg = await e2e.seedArchlinuxPackage({ pkgname: 'acl' });
      const attrPkg = await e2e.seedArchlinuxPackage({ pkgname: 'attr' });
      await e2e.seedElfAnalysis({
        pkgId: aclPkg.id,
        version: '2.4.0',
        providedSonames: ['libacl.so.1'],
        neededSonames: ['libc.so.6'],
      });
      await e2e.seedElfAnalysis({
        pkgId: attrPkg.id,
        version: '2.6.0',
        providedSonames: ['libattr.so.1'],
        neededSonames: ['libacl.so.1', 'libc.so.6'],
      });

      type Edge = { consumer: { pkgname: string }; provider: { pkgname: string }; soname: string };
      const res = await e2e.inject<Edge[]>({ method: 'GET', url: '/repo/dependencies' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      const edge = body.find(
        (e) => e.soname === 'libacl.so.1' && e.consumer.pkgname === 'attr' && e.provider.pkgname === 'acl',
      );
      expect(edge).toBeDefined();
    });

    it('returns an empty array when no soname relationships exist', async () => {
      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/repo/dependencies' });
      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });
});
