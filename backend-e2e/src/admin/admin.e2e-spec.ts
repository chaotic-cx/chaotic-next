import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('Admin Endpoints (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.close();
  });

  beforeEach(async () => {
    await e2e.resetTables();
  });

  describe('GET /admin/packages', () => {
    it('returns empty paginated list when no packages exist', async () => {
      const res = await e2e.inject({
        method: 'GET',
        url: '/admin/packages',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        items: [],
        total: 0,
        page: 1,
        perPage: 25,
        totalPages: 0,
      });
    });

    it('filters packages by query (q), repoId, and active status with pagination', async () => {
      const repo1 = await e2e.seedRepo({ name: 'main-repo' });
      const repo2 = await e2e.seedRepo({ name: 'extra-repo' });

      await e2e.seedPackage({ pkgname: 'libfoo', repo: repo1, isActive: true });
      await e2e.seedPackage({ pkgname: 'libbar', repo: repo1, isActive: false });
      await e2e.seedPackage({ pkgname: 'baz-tool', repo: repo2, isActive: true });

      const resQ = await e2e.inject({
        method: 'GET',
        url: '/admin/packages?q=lib',
      });
      expect(resQ.statusCode).toBe(200);
      const bodyQ = (await resQ.json()) as { total: number; items: Array<{ pkgname: string }> };
      expect(bodyQ.total).toBe(2);
      expect(bodyQ.items.map((p) => p.pkgname)).toEqual(['libbar', 'libfoo']);

      const resRepo = await e2e.inject({
        method: 'GET',
        url: `/admin/packages?repoId=${repo2.id}`,
      });
      expect(resRepo.statusCode).toBe(200);
      const bodyRepo = (await resRepo.json()) as { total: number; items: Array<{ pkgname: string }> };
      expect(bodyRepo.total).toBe(1);
      expect(bodyRepo.items[0].pkgname).toBe('baz-tool');

      const resActive = await e2e.inject({
        method: 'GET',
        url: '/admin/packages?active=true',
      });
      expect(resActive.statusCode).toBe(200);
      const bodyActive = (await resActive.json()) as { total: number; items: Array<{ pkgname: string }> };
      expect(bodyActive.total).toBe(2);
      expect(bodyActive.items.map((p) => p.pkgname)).toEqual(['baz-tool', 'libfoo']);

      const resInactive = await e2e.inject({
        method: 'GET',
        url: '/admin/packages?active=false',
      });
      expect(resInactive.statusCode).toBe(200);
      const bodyInactive = (await resInactive.json()) as { total: number; items: Array<{ pkgname: string }> };
      expect(bodyInactive.total).toBe(1);
      expect(bodyInactive.items[0].pkgname).toBe('libbar');
    });

    it('rejects invalid pagination/query parameters with 400 Bad Request', async () => {
      const res = await e2e.inject({
        method: 'GET',
        url: '/admin/packages?page=invalid&perPage=abc',
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH & DELETE /admin/packages', () => {
    it('updates and deletes packages', async () => {
      const pkg = await e2e.seedPackage({ pkgname: 'test-pkg', version: '1.0.0', isActive: true });

      const patchRes = await e2e.inject({
        method: 'PATCH',
        url: `/admin/packages/${pkg.id}`,
        payload: {
          isActive: false,
          version: '1.0.1',
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const updated = (await patchRes.json()) as { isActive: boolean; version: string };
      expect(updated.isActive).toBe(false);
      expect(updated.version).toBe('1.0.1');

      const delRes = await e2e.inject({
        method: 'DELETE',
        url: `/admin/packages/${pkg.id}`,
      });

      expect(delRes.statusCode).toBe(200);

      const listRes = await e2e.inject({
        method: 'GET',
        url: `/admin/packages?q=test-pkg`,
      });
      const listBody = (await listRes.json()) as { total: number };
      expect(listBody.total).toBe(0);
    });

    it('returns 400 on non-numeric ID parameter', async () => {
      const resPatch = await e2e.inject({
        method: 'PATCH',
        url: '/admin/packages/not-a-number',
        payload: { version: '2.0.0' },
      });
      expect(resPatch.statusCode).toBe(400);

      const resDel = await e2e.inject({
        method: 'DELETE',
        url: '/admin/packages/abc',
      });
      expect(resDel.statusCode).toBe(400);
    });

    it('returns 404 when updating or deleting non-existent package', async () => {
      const patchRes = await e2e.inject({
        method: 'PATCH',
        url: '/admin/packages/99999',
        payload: { version: '2.0.0' },
      });
      expect(patchRes.statusCode).toBe(404);

      const delRes = await e2e.inject({
        method: 'DELETE',
        url: '/admin/packages/99999',
      });
      expect(delRes.statusCode).toBe(404);
    });
  });

  describe('GET, PATCH, DELETE /admin/arch-packages', () => {
    it('manages Arch packages (list, filter, patch, delete)', async () => {
      await e2e.seedArchlinuxPackage({ pkgname: 'gcc', version: '14.1.0' });
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'glibc', version: '2.39' });

      const listRes = await e2e.inject({
        method: 'GET',
        url: '/admin/arch-packages?q=gcc',
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = (await listRes.json()) as { total: number; items: Array<{ pkgname: string }> };
      expect(listBody.total).toBe(1);
      expect(listBody.items[0].pkgname).toBe('gcc');

      const patchRes = await e2e.inject({
        method: 'PATCH',
        url: `/admin/arch-packages/${archPkg.id}`,
        payload: { version: '2.40' },
      });
      expect(patchRes.statusCode).toBe(200);
      const updated = (await patchRes.json()) as { version: string };
      expect(updated.version).toBe('2.40');

      const delRes = await e2e.inject({
        method: 'DELETE',
        url: `/admin/arch-packages/${archPkg.id}`,
      });
      expect(delRes.statusCode).toBe(200);
    });
  });

  describe('GET, POST, PATCH, DELETE /admin/repos', () => {
    it('manages repos (list, create, update, delete)', async () => {
      await e2e.seedRepo({ name: 'main-repo' });

      const listRes = await e2e.inject({
        method: 'GET',
        url: '/admin/repos',
      });
      expect(listRes.statusCode).toBe(200);
      const repos = (await listRes.json()) as Array<{ id: number; name: string }>;
      expect(repos.some((r) => r.name === 'main-repo')).toBe(true);

      const createRes = await e2e.inject({
        method: 'POST',
        url: '/admin/repos',
        payload: {
          name: 'new-repo',
          repoUrl: 'https://aur.chaotic.cx/new-repo',
          isActive: true,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = (await createRes.json()) as { id: number; name: string };
      expect(created.name).toBe('new-repo');

      const patchRes = await e2e.inject({
        method: 'PATCH',
        url: `/admin/repos/${created.id}`,
        payload: { isActive: false },
      });
      expect(patchRes.statusCode).toBe(200);

      const delRes = await e2e.inject({
        method: 'DELETE',
        url: `/admin/repos/${created.id}`,
      });
      expect(delRes.statusCode).toBe(200);
    });
  });

  describe('GET, PATCH, DELETE /admin/builders', () => {
    it('manages builders with pagination, filter, update, delete', async () => {
      const builder1 = await e2e.seedBuilder({ name: 'builder-alpha', isActive: true });
      await e2e.seedBuilder({ name: 'builder-beta', isActive: false });

      const listRes = await e2e.inject({
        method: 'GET',
        url: '/admin/builders?active=true',
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = (await listRes.json()) as { total: number; items: Array<{ name: string }> };
      expect(listBody.total).toBe(1);
      expect(listBody.items[0].name).toBe('builder-alpha');

      const patchRes = await e2e.inject({
        method: 'PATCH',
        url: `/admin/builders/${builder1.id}`,
        payload: { description: 'Updated Builder Alpha' },
      });
      expect(patchRes.statusCode).toBe(200);

      const delRes = await e2e.inject({
        method: 'DELETE',
        url: `/admin/builders/${builder1.id}`,
      });
      expect(delRes.statusCode).toBe(200);
    });
  });

  describe('GET /admin/mr-actions', () => {
    it('lists paginated MR actions and filters by query / action', async () => {
      await e2e.seedMrAction({ mergeRequestIid: 101, action: 'approve', userName: 'Alice' });
      await e2e.seedMrAction({ mergeRequestIid: 102, action: 'hold', userName: 'Bob' });

      const resQ = await e2e.inject({
        method: 'GET',
        url: '/admin/mr-actions?q=Alice',
      });
      expect(resQ.statusCode).toBe(200);
      const bodyQ = (await resQ.json()) as { total: number; items: Array<{ userName: string }> };
      expect(bodyQ.total).toBe(1);
      expect(bodyQ.items[0].userName).toBe('Alice');

      const resAction = await e2e.inject({
        method: 'GET',
        url: '/admin/mr-actions?action=hold',
      });
      expect(resAction.statusCode).toBe(200);
      const bodyAction = (await resAction.json()) as { total: number; items: Array<{ action: string }> };
      expect(bodyAction.total).toBe(1);
      expect(bodyAction.items[0].action).toBe('hold');
    });
  });

  describe('GET /admin/pipeline-triggers', () => {
    it('lists paginated pipeline triggers and filters by query / operation', async () => {
      await e2e.seedPipelineTrigger({ pipelineId: 6001, operation: 'Bump Packages', userName: 'Alice' });
      await e2e.seedPipelineTrigger({
        pipelineId: 6002,
        operation: 'None',
        inputs: { operation: 'None' },
        userName: 'Bob',
      });

      const resQ = await e2e.inject({
        method: 'GET',
        url: '/admin/pipeline-triggers?q=Alice',
      });
      expect(resQ.statusCode).toBe(200);
      const bodyQ = (await resQ.json()) as { total: number; items: Array<{ userName: string }> };
      expect(bodyQ.total).toBe(1);
      expect(bodyQ.items[0].userName).toBe('Alice');

      const resPipelineId = await e2e.inject({
        method: 'GET',
        url: '/admin/pipeline-triggers?q=6002',
      });
      expect(resPipelineId.statusCode).toBe(200);
      const bodyPipelineId = (await resPipelineId.json()) as { total: number };
      expect(bodyPipelineId.total).toBe(1);

      const resOperation = await e2e.inject({
        method: 'GET',
        url: '/admin/pipeline-triggers?operation=None',
      });
      expect(resOperation.statusCode).toBe(200);
      const bodyOperation = (await resOperation.json()) as {
        total: number;
        items: Array<{ operation: string; inputs: Record<string, string>; webUrl: string }>;
      };
      expect(bodyOperation.total).toBe(1);
      expect(bodyOperation.items[0].operation).toBe('None');
      expect(bodyOperation.items[0].inputs).toEqual({ operation: 'None' });
      expect(bodyOperation.items[0].webUrl).toContain('gitlab.com');
    });
  });

  describe('GET /admin/package-bumps', () => {
    it('lists package bumps with filters (q, bumpType, triggerFrom)', async () => {
      const pkg1 = await e2e.seedPackage({ pkgname: 'firefox' });
      const pkg2 = await e2e.seedPackage({ pkgname: 'thunderbird' });
      await e2e.seedPackageBump({ pkg: pkg1, bumpType: 1, triggerFrom: 0 });
      await e2e.seedPackageBump({ pkg: pkg2, bumpType: 2, triggerFrom: 1 });

      const res = await e2e.inject({
        method: 'GET',
        url: '/admin/package-bumps?bumpType=1&q=firefox',
      });

      expect(res.statusCode).toBe(200);
      const body = (await res.json()) as { total: number; items: Array<{ pkgname: string }> };
      expect(body.total).toBe(1);
      expect(body.items[0].pkgname).toBe('firefox');
    });
  });

  describe('GET, PATCH, DELETE /admin/package-elf-analysis', () => {
    it('manages ELF analysis entries (list, update, delete)', async () => {
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'bash' });
      const analysis = await e2e.seedElfAnalysis({ pkgType: '0', pkgId: archPkg.id, broken: true, version: '5.2' });

      const listRes = await e2e.inject({
        method: 'GET',
        url: '/admin/package-elf-analysis?pkgType=0&broken=true',
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = (await listRes.json()) as { total: number; items: Array<{ version: string; broken: boolean }> };
      expect(listBody.total).toBe(1);
      expect(listBody.items[0].broken).toBe(true);

      const patchRes = await e2e.inject({
        method: 'PATCH',
        url: `/admin/package-elf-analysis/${analysis.id}`,
        payload: { broken: false, brokenReasons: [] },
      });
      expect(patchRes.statusCode).toBe(200);
      const updated = (await patchRes.json()) as { broken: boolean };
      expect(updated.broken).toBe(false);

      const delRes = await e2e.inject({
        method: 'DELETE',
        url: `/admin/package-elf-analysis/${analysis.id}`,
      });
      expect(delRes.statusCode).toBe(200);
    });
  });

  describe('POST /admin/rescan', () => {
    it('reports packages not found when rescan list is empty', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/admin/rescan',
        payload: { packages: [] },
      });

      expect(res.statusCode).toBe(201);
      const body = (await res.json()) as { rescanned: number; failed: string[] };
      expect(body.rescanned).toBe(0);
      expect(body.failed).toEqual([]);
    });

    it('reports failure for unknown chaotic package', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/admin/rescan',
        payload: { packages: [{ pkgname: 'nonexistent-pkg', pkgType: '1' }] },
      });

      expect(res.statusCode).toBe(201);
      const body = (await res.json()) as { rescanned: number; failed: string[] };
      expect(body.rescanned).toBe(0);
      expect(body.failed).toEqual(['nonexistent-pkg: not found']);
    });

    it('reports failure for unknown arch package', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/admin/rescan',
        payload: { packages: [{ pkgname: 'nonexistent-arch-pkg', pkgType: '0' }] },
      });

      expect(res.statusCode).toBe(201);
      const body = (await res.json()) as { rescanned: number; failed: string[] };
      expect(body.rescanned).toBe(0);
      expect(body.failed).toEqual(['nonexistent-arch-pkg: not found']);
    });

    it('reports failure when download fails (no real mirror)', async () => {
      await e2e.seedPackage({ pkgname: 'test-rescan-pkg' });

      const res = await e2e.inject({
        method: 'POST',
        url: '/admin/rescan',
        payload: { packages: [{ pkgname: 'test-rescan-pkg', pkgType: '1' }] },
      });

      expect(res.statusCode).toBe(201);
      const body = (await res.json()) as { rescanned: number; failed: string[] };
      expect(body.rescanned).toBe(0);
      expect(body.failed.length).toBe(1);
      expect(body.failed[0]).toContain('test-rescan-pkg');
    });
  });

  describe('GET /admin/package-elf-analysis/:id/bumps', () => {
    it('lists the rebuild bumps of an analysis row', async () => {
      const archPkg = await e2e.seedArchlinuxPackage({ pkgname: 'bash' });
      const analysis = await e2e.seedElfAnalysis({ pkgType: '0', pkgId: archPkg.id, version: '5.2' });
      const pkg = await e2e.seedPackage({ pkgname: 'firefox' });
      await e2e.seedPackageBump({ pkg, bumpType: 1, trigger: archPkg.id, triggerFrom: 0 });

      const res = await e2e.inject({ method: 'GET', url: `/admin/package-elf-analysis/${analysis.id}/bumps` });

      expect(res.statusCode).toBe(200);
      const bumps = (await res.json()) as Array<{ bumpType: number }>;
      expect(bumps).toHaveLength(1);
      expect(bumps[0].bumpType).toBe(1);
    });

    it('answers 404 for an unknown analysis id', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/admin/package-elf-analysis/999999/bumps' });
      expect(res.statusCode).toBe(404);
    });
  });
});
