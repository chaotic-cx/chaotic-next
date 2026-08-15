import 'reflect-metadata';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '@chaotic-next/backend/app.module';
import { RepoManagerService } from '@chaotic-next/backend/repo-manager/repo-manager.service';

describe('Repo-manager trigger endpoints (e2e, real PostgreSQL)', () => {
  let app: NestFastifyApplication;
  let repoManagerService: RepoManagerService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.listen(0);
    repoManagerService = app.get<RepoManagerService>(RepoManagerService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /repo/run', () => {
    it('triggers repoManager.run() and returns 200', async () => {
      const spy = vi.spyOn(repoManagerService, 'run').mockImplementation(vi.fn());

      const res = await app.inject({ method: 'GET', url: '/repo/run' });

      expect(res.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /repo/signal-scan', () => {
    it('triggers repoManager.triggerSignalScan() and returns 200', async () => {
      const spy = vi.spyOn(repoManagerService, 'triggerSignalScan').mockImplementation(vi.fn());

      const res = await app.inject({ method: 'GET', url: '/repo/signal-scan' });

      expect(res.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /repo/update-db', () => {
    it('triggers repoManager.updateChaoticVersions() and returns 200', async () => {
      const spy = vi.spyOn(repoManagerService, 'updateChaoticVersions').mockResolvedValue(undefined);

      const res = await app.inject({ method: 'GET', url: '/repo/update-db' });

      expect(res.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /repo/index/arch', () => {
    it('calls indexArchMirror and returns the result', async () => {
      const expectedResult = { total: 100, added: 50, updated: 50, unchanged: 0 };
      vi.spyOn(repoManagerService, 'indexArchMirror').mockResolvedValue(expectedResult as never);

      const res = await app.inject({ method: 'POST', url: '/repo/index/arch' });

      expect(res.statusCode).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject(expectedResult);
    });
  });

  describe('POST /repo/index/chaotic', () => {
    it('calls indexChaoticRepo with the provided URL and returns the result', async () => {
      const dbUrl = 'https://cdn-mirror.chaotic.cx/chaotic-aur/x86_64/chaotic-aur.db';
      const expectedResult = { total: 50, added: 30, updated: 20, unchanged: 0 };
      const spy = vi.spyOn(repoManagerService, 'indexChaoticRepo').mockResolvedValue(expectedResult as never);

      const res = await app.inject({
        method: 'POST',
        url: '/repo/index/chaotic',
        payload: { url: dbUrl },
      });

      expect(res.statusCode).toBe(201);
      expect(spy).toHaveBeenCalledWith(dbUrl);
      const body = await res.json();
      expect(body).toMatchObject(expectedResult);
    });
  });
});
