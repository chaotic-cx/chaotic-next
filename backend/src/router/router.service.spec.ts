import { nDaysInPast, utcDayStart } from '../utils/functions';
import type { DataSource } from 'typeorm';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { RouterService } from './router.service';

const MIN_DAYS = 1;
const MAX_DAYS = 3650;

/** The query-builder surface RouterService uses, typed so mock calls inspect cleanly. */
interface QueryBuilderMock {
  select: Mock<(alias: string, aliasName?: string) => QueryBuilderMock>;
  addSelect: Mock<(alias: string, aliasName?: string) => QueryBuilderMock>;
  where: Mock<(condition: string, parameters: { cutoff: Date }) => QueryBuilderMock>;
  groupBy: Mock<(expression: string) => QueryBuilderMock>;
  addGroupBy: Mock<(expression: string) => QueryBuilderMock>;
  orderBy: Mock<(expression: string) => QueryBuilderMock>;
  getRawMany: Mock<() => Promise<unknown[]>>;
  getRawOne: Mock<() => Promise<unknown>>;
}

function createService(rawMany: unknown[], rawOne: unknown = undefined) {
  const qb: QueryBuilderMock = {
    select: vi.fn(() => qb),
    addSelect: vi.fn(() => qb),
    where: vi.fn(() => qb),
    groupBy: vi.fn(() => qb),
    addGroupBy: vi.fn(() => qb),
    orderBy: vi.fn(() => qb),
    getRawMany: vi.fn().mockResolvedValue(rawMany),
    getRawOne: vi.fn().mockResolvedValue(rawOne),
  };
  const repository = { createQueryBuilder: vi.fn(() => qb) };
  const dataSource = { getRepository: vi.fn(() => repository) } as unknown as DataSource;
  const cache = {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new RouterService(dataSource, cache as never), qb, repository, cache };
}

describe('RouterService', () => {
  it('returns country stats', async () => {
    const rows = [{ country: 'US', count: '100' }];
    const { service, qb, repository } = createService(rows);
    const result = await service.getCountryStats(30);
    expect(result).toEqual(rows);
    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(qb.select).toHaveBeenCalledWith('hit.country', 'country');
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('returns mirror stats', async () => {
    const rows = [{ mirror: 'geo-mirror.chaotic.cx', count: '5' }];
    const { service, qb } = createService(rows);
    await expect(service.getMirrorStats(30)).resolves.toEqual(rows);
    expect(qb.select).toHaveBeenCalledWith('hit.hostname', 'mirror');
  });

  it('returns package stats', async () => {
    const rows = [{ pkgbase: 'firefox', count: '5' }];
    const { service, qb } = createService(rows);
    await expect(service.getPackageStats(30)).resolves.toEqual(rows);
    expect(qb.select).toHaveBeenCalledWith('hit.package', 'pkgbase');
  });

  it('returns per-day stats', async () => {
    const rows = [{ day: '2026-08-01', count: '3' }];
    const { service, qb } = createService(rows);
    await expect(service.getPerDayStats(30)).resolves.toEqual(rows);
    expect(qb.select).toHaveBeenCalledWith(`TO_CHAR(hit.day, 'YYYY-MM-DD')::text`, 'day');
  });

  it('returns mirror stats over time', async () => {
    const rows = [{ day: '2026-08-01', mirror: 'geo-mirror.chaotic.cx', count: '5' }];
    const { service, qb } = createService(rows);
    await expect(service.getMirrorStatsOverTime(30)).resolves.toEqual(rows);
    expect(qb.select).toHaveBeenCalledWith(`TO_CHAR(hit.day, 'YYYY-MM-DD')`, 'day');
    expect(qb.addSelect).toHaveBeenCalledWith('hit.hostname', 'mirror');
  });

  it('returns country stats over time', async () => {
    const rows = [{ day: '2026-08-01', country: 'US', count: '5' }];
    const { service, qb } = createService(rows);
    await expect(service.getCountryStatsOverTime(30)).resolves.toEqual(rows);
    expect(qb.select).toHaveBeenCalledWith(`TO_CHAR(hit.day, 'YYYY-MM-DD')`, 'day');
    expect(qb.addSelect).toHaveBeenCalledWith('hit.country', 'country');
  });

  it('clamps days below the minimum to the minimum', async () => {
    const { service, qb } = createService([]);
    await service.getCountryStats(MIN_DAYS - 1);
    const { cutoff } = qb.where.mock.calls[0][1];
    expect(cutoff).toEqual(utcDayStart(nDaysInPast(MIN_DAYS)));
  });

  it('clamps days above the maximum to the maximum', async () => {
    const { service, qb } = createService([]);
    await service.getCountryStats(MAX_DAYS + 1);
    const { cutoff } = qb.where.mock.calls[0][1];
    expect(cutoff).toEqual(utcDayStart(nDaysInPast(MAX_DAYS)));
  });
});
