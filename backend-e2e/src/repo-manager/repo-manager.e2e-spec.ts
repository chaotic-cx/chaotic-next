import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';
import { BROKEN_ELF_ANALYSIS } from '../test/fixtures';
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
