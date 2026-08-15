import { BadRequestException } from '@nestjs/common';
import { nDaysInPast } from '../utils/functions';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from './metrics.service';

const MIN_DAYS = 1;
const MAX_DAYS = 3650;
const TOLERANCE_MS = 5_000;

interface QbMock {
  getRawMany: ReturnType<typeof vi.fn>;
  getRawOne: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock allows chaining arbitrary query-builder methods
  [k: string]: any;
}

function makeQb() {
  const getRawMany = vi.fn().mockResolvedValue([]);
  const getRawOne = vi.fn().mockResolvedValue(undefined);
  const qb: QbMock = {
    select: vi.fn(() => qb),
    addSelect: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    groupBy: vi.fn(() => qb),
    orderBy: vi.fn(() => qb),
    limit: vi.fn(() => qb),
    getRawMany,
    getRawOne,
  };
  return qb;
}

function createService(qb: QbMock) {
  const repository = { createQueryBuilder: vi.fn(() => qb) };
  const dataSource = { getRepository: vi.fn(() => repository) } as unknown as DataSource;
  return { service: new MetricsService(dataSource), qb, repository };
}

describe('MetricsService', () => {
  describe('uniqueUsers', () => {
    it('returns the unique ip count', async () => {
      const qb = makeQb();
      qb.getRawOne.mockResolvedValueOnce({ count: 42 });
      const { service } = createService(qb);
      await expect(service.uniqueUsers(30)).resolves.toBe(42);
    });

    it('returns 0 when no rows', async () => {
      const qb = makeQb();
      const { service } = createService(qb);
      await expect(service.uniqueUsers(30)).resolves.toBe(0);
    });

    it('clamps days below the minimum to the minimum', async () => {
      const qb = makeQb();
      const { service } = createService(qb);
      await service.uniqueUsers(MIN_DAYS - 1);
      const cutoff = (qb.where.mock.calls[0][1] as { cutoff: Date }).cutoff;
      expect(Math.abs(cutoff.getTime() - nDaysInPast(MIN_DAYS).getTime())).toBeLessThan(TOLERANCE_MS);
    });

    it('clamps days above the maximum to the maximum', async () => {
      const qb = makeQb();
      const { service } = createService(qb);
      await service.uniqueUsers(MAX_DAYS + 1);
      const cutoff = (qb.where.mock.calls[0][1] as { cutoff: Date }).cutoff;
      expect(Math.abs(cutoff.getTime() - nDaysInPast(MAX_DAYS).getTime())).toBeLessThan(TOLERANCE_MS);
    });
  });

  describe('uniqueUserAgents', () => {
    it('returns the user agent list', async () => {
      const qb = makeQb();
      const rows = [
        { name: 'pacman/7.0.0', count: 10 },
        { name: 'pacman/6.0.0', count: 5 },
      ];
      qb.getRawMany.mockResolvedValueOnce(rows);
      const { service } = createService(qb);
      const result = await service.uniqueUserAgents();
      expect(result).toEqual(rows);
    });
  });

  describe('packageMetrics', () => {
    it('returns downloads and user agents', async () => {
      const qb = makeQb();
      qb.getRawOne.mockResolvedValueOnce({ count: 7 });
      qb.getRawMany.mockResolvedValueOnce([{ name: 'pacman/7.0.0', count: 3 }]);
      const { service, repository } = createService(qb);
      const result = await service.packageMetrics('some-pkg', 30);
      expect(result).toEqual({
        name: 'some-pkg',
        downloads: 7,
        user_agents: [{ name: 'pacman/7.0.0', count: 3 }],
      });
      // two queries run (one per createQueryBuilder call)
      expect(repository.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(qb.getRawOne).toHaveBeenCalledTimes(1);
      expect(qb.getRawMany).toHaveBeenCalledTimes(1);
    });

    it('returns 0 downloads when none found', async () => {
      const qb = makeQb();
      qb.getRawOne.mockResolvedValueOnce(undefined);
      qb.getRawMany.mockResolvedValueOnce([]);
      const { service } = createService(qb);
      const result = await service.packageMetrics('some-pkg');
      expect(result.downloads).toBe(0);
      expect(result.user_agents).toEqual([]);
    });

    it.each(['some-pkg', 'a+b', 'pkg@host', 'name.with.dots', 'under_score'])(
      'accepts a valid package name: %s',
      async (name) => {
        const qb = makeQb();
        const { service } = createService(qb);
        const result = await service.packageMetrics(name, 30);
        expect(result.name).toBe(name);
      },
    );

    it.each(['', '../evil'])('rejects an invalid package name: %s', async (name) => {
      const { service } = createService(makeQb());
      await expect(service.packageMetrics(name, 30)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a package name longer than 255 characters', async () => {
      const { service } = createService(makeQb());
      await expect(service.packageMetrics('a'.repeat(256), 30)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('rankCountries', () => {
    it('returns the country ranking', async () => {
      const qb = makeQb();
      const rows = [
        { name: 'US', count: 100 },
        { name: 'DE', count: 50 },
      ];
      qb.getRawMany.mockResolvedValueOnce(rows);
      const { service, qb: mqb } = createService(qb);
      const result = await service.rankCountries('10', 30);
      expect(result).toEqual(rows);
      expect(mqb.limit).toHaveBeenCalledWith(10);
    });

    it('rejects a non-numeric range', async () => {
      const { service } = createService(makeQb());
      await expect(service.rankCountries('abc')).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['0', '201', '999'])('rejects a range outside 1..200: %s', async (range) => {
      const { service } = createService(makeQb());
      await expect(service.rankCountries(range)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['1', '200'])('accepts a range at the 1..200 boundary: %s', async (range) => {
      const qb = makeQb();
      const { service, qb: mqb } = createService(qb);
      await service.rankCountries(range, 30);
      expect(mqb.limit).toHaveBeenCalledWith(Number(range));
    });
  });

  describe('rankPackages', () => {
    it('returns the package ranking', async () => {
      const qb = makeQb();
      const rows = [{ name: 'firefox', count: 5 }];
      qb.getRawMany.mockResolvedValueOnce(rows);
      const { service } = createService(qb);
      const result = await service.rankPackages('5', 30);
      expect(result).toEqual(rows);
    });

    it('rejects a non-numeric range', async () => {
      const { service } = createService(makeQb());
      await expect(service.rankPackages('x')).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['0', '201', '999'])('rejects a range outside 1..200: %s', async (range) => {
      const { service } = createService(makeQb());
      await expect(service.rankPackages(range)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['1', '200'])('accepts a range at the 1..200 boundary: %s', async (range) => {
      const qb = makeQb();
      const { service, qb: mqb } = createService(qb);
      await service.rankPackages(range, 30);
      expect(mqb.limit).toHaveBeenCalledWith(Number(range));
    });
  });
});
