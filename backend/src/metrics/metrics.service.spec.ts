import { LiveTrafficHit } from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { PassThrough } from 'node:stream';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { nDaysInPast, utcDayStart } from '../utils/functions';
import { MetricsService, parseRpsLine, parseTrafficLine } from './metrics.service';

const MIN_DAYS = 1;
const MAX_DAYS = 3650;

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

function makeCache() {
  return { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) };
}

function makeHttpService() {
  return { axiosRef: vi.fn() } as unknown as HttpService;
}

function createService(qb: QbMock) {
  const repository = { createQueryBuilder: vi.fn(() => qb) };
  const dataSource = {
    getRepository: vi.fn(() => repository),
    query: vi.fn(),
  } as unknown as DataSource;
  return {
    service: new MetricsService(dataSource, makeCache() as never, makeHttpService()),
    qb,
    repository,
    dataSource,
  };
}

function createServiceWithQuery(dataSource: DataSource) {
  return { service: new MetricsService(dataSource, makeCache() as never, makeHttpService()) };
}

describe('MetricsService', () => {
  describe('uniqueUsers', () => {
    it('returns the unique ip count', async () => {
      const dataSource = { query: vi.fn().mockResolvedValue([{ count: 42 }]) } as unknown as DataSource;
      const { service } = createServiceWithQuery(dataSource);
      await expect(service.uniqueUsers(30)).resolves.toBe(42);
    });

    it('returns 0 when no rows', async () => {
      const dataSource = { query: vi.fn().mockResolvedValue([]) } as unknown as DataSource;
      const { service } = createServiceWithQuery(dataSource);
      await expect(service.uniqueUsers(30)).resolves.toBe(0);
    });

    it('clamps days below the minimum to the minimum', async () => {
      const query = vi.fn().mockResolvedValue([{ count: 1 }]);
      const { service } = createServiceWithQuery({ query } as unknown as DataSource);
      await service.uniqueUsers(MIN_DAYS - 1);
      const cutoff = query.mock.calls[0][1][0];
      expect(cutoff).toEqual(utcDayStart(nDaysInPast(MIN_DAYS)));
    });

    it('clamps days above the maximum to the maximum', async () => {
      const query = vi.fn().mockResolvedValue([{ count: 1 }]);
      const { service } = createServiceWithQuery({ query } as unknown as DataSource);
      await service.uniqueUsers(MAX_DAYS + 1);
      const cutoff = query.mock.calls[0][1][0];
      expect(cutoff).toEqual(utcDayStart(nDaysInPast(MAX_DAYS)));
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

  describe('parseTrafficLine', () => {
    it('parses pipe-delimited raw metric line correctly', () => {
      const line =
        '1787394450940|(PL) de6cbd|garuda|303|||||pacman/7.1.0 (Linux x86_64) libalpm/16.0.1|geo-mirror.chaotic.cx|web.1';
      const hit = parseTrafficLine(line);
      expect(hit).not.toBeNull();
      expect(hit?.timestamp).toBe(1787394450940);
      expect(hit?.countryCode).toBe('PL');
      expect(hit?.userHash).toBe('de6cbd');
      expect(hit?.repo).toBe('garuda');
      expect(hit?.statusCode).toBe(303);
      expect(hit?.userAgent).toBe('pacman/7.1.0 (Linux x86_64) libalpm/16.0.1');
      expect(hit?.hostname).toBe('geo-mirror.chaotic.cx');
      expect(hit?.worker).toBe('web.1');
    });

    it('returns null on invalid or empty lines', () => {
      expect(parseTrafficLine('')).toBeNull();
      expect(parseTrafficLine('short|line')).toBeNull();
    });
  });

  describe('parseRpsLine', () => {
    it.each([
      ['data: 42', 42],
      ['data:0', 0],
      ['data: 7 \n', 7],
    ])('parses SSE count frame: %s', (line, expected) => {
      expect(parseRpsLine(line)).toEqual({ rps: expected });
    });

    it('returns null on non-data lines', () => {
      expect(parseRpsLine('retry: 1000')).toBeNull();
      expect(parseRpsLine('data: not-a-number')).toBeNull();
      expect(parseRpsLine('')).toBeNull();
    });
  });

  describe('getLiveTrafficStream', () => {
    const TRAFFIC_URL = 'https://metrics.chaotic.cx/live/traffic';

    function createStreamService(): {
      service: MetricsService;
      trafficStream: PassThrough;
      rpsStream: PassThrough;
      axiosRef: ReturnType<typeof vi.fn>;
    } {
      const trafficStream = new PassThrough();
      const rpsStream = new PassThrough();
      const axiosRef = vi
        .fn()
        .mockImplementation(({ url }: { url: string }) =>
          Promise.resolve({ data: url === TRAFFIC_URL ? trafficStream : rpsStream }),
        );
      const mockHttp = { axiosRef } as unknown as HttpService;
      const dataSource = { getRepository: vi.fn(), query: vi.fn() } as unknown as DataSource;
      return {
        service: new MetricsService(dataSource, makeCache() as never, mockHttp),
        trafficStream,
        rpsStream,
        axiosRef,
      };
    }

    it('emits parsed SSE events from upstream stream data', async () => {
      const { service, trafficStream } = createStreamService();

      const events: { data: LiveTrafficHit }[] = [];
      const sub = service.getLiveTrafficStream().subscribe({
        next: (ev) => events.push(ev as { data: LiveTrafficHit }),
      });

      trafficStream.write(
        '1787394450940|(PL) de6cbd|garuda|303|||||pacman/7.1.0 (Linux x86_64) libalpm/16.0.1|geo-mirror.chaotic.cx|web.1\n',
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(events.length).toBe(1);
      expect(events[0].data.countryCode).toBe('PL');
      expect(events[0].data.repo).toBe('garuda');

      sub.unsubscribe();
    });

    it('emits router RPS as a named "rps" event from upstream stream data', async () => {
      const { service, rpsStream } = createStreamService();

      const events: { type?: string; data: unknown }[] = [];
      const sub = service.getLiveTrafficStream().subscribe({
        next: (ev) => events.push(ev as { type?: string; data: unknown }),
      });

      rpsStream.write('retry: 1000\ndata: 0\ndata: 42\n');

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(events).toEqual([
        { type: 'rps', data: { rps: 0 } },
        { type: 'rps', data: { rps: 42 } },
      ]);

      sub.unsubscribe();
    });

    it('shares one upstream connection pair across concurrent subscribers', async () => {
      const { service, trafficStream, axiosRef } = createStreamService();

      const first = service.getLiveTrafficStream().subscribe();
      const second = service.getLiveTrafficStream().subscribe();

      trafficStream.write(
        '1787394450940|(PL) de6cbd|garuda|303|||||pacman/7.1.0 (Linux x86_64) libalpm/16.0.1|geo-mirror.chaotic.cx|web.1\n',
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(axiosRef).toHaveBeenCalledTimes(2);

      first.unsubscribe();
      second.unsubscribe();
    });
  });
});
