import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScanIndicator } from './indicators';
import { VirusTotalVerdict } from './virus-total-verdict.entity';
import { VirustotalService } from './virustotal.service';

const SHA256_LENGTH = 64;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const URL_INDICATOR: ScanIndicator = { type: 'url', value: 'https://evil.example/payload', context: 'x:1' };
const FILE_INDICATOR: ScanIndicator = {
  type: 'file',
  value: 'a'.repeat(SHA256_LENGTH),
  context: 'x (source checksum)',
};

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function makeService(config: { apiKey?: string }, repository?: object): VirustotalService {
  const store = new Map<string, unknown>();
  const cache = {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
  return new VirustotalService(
    cache as never,
    new ConfigService({ vt: { requestSpacingMs: 0, pollIntervalMs: 0, ...config } }),
    repository as never,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VirustotalService', () => {
  it('is inert without an API key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({});

    expect(service.enabled).toBe(false);
    await expect(service.reportOn([URL_INDICATOR])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps file hash stats to a report and serves repeat lookups from the cache', async () => {
    const stats = { malicious: 4, suspicious: 1, undetected: 50, harmless: 10, timeout: 1 };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { attributes: { last_analysis_stats: stats } } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({ apiKey: 'key' });

    expect(service.enabled).toBe(true);
    await expect(service.reportOn([FILE_INDICATOR])).resolves.toEqual([
      {
        type: 'file',
        value: FILE_INDICATOR.value,
        context: FILE_INDICATOR.context,
        verdict: 'malicious',
        stats,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(service.reportOn([FILE_INDICATOR])).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats file hashes unknown to VirusTotal as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { error: {} })));
    const service = makeService({ apiKey: 'key' });

    const reports = await service.reportOn([FILE_INDICATOR]);
    expect(reports[0]?.verdict).toBe('unknown');
    expect(reports[0]?.stats).toBeUndefined();
  });

  it('submits URLs for scanning and polls the analysis to completion', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'analysis-1' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { attributes: { status: 'in-progress' } } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { attributes: { status: 'completed', stats: { suspicious: 2, undetected: 40, harmless: 20 } } },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({ apiKey: 'key' });

    const reports = await service.reportOn([URL_INDICATOR]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://www.virustotal.com/api/v3/urls');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('url=https%3A%2F%2Fevil.example%2Fpayload');
    expect(reports[0]?.verdict).toBe('suspicious');
    expect(reports[0]?.stats).toEqual({ malicious: 0, suspicious: 2, undetected: 40, harmless: 20, timeout: 0 });
  });

  it('does not flag a single flagged engine as suspicious (noise reduction)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'analysis-1' } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            attributes: { status: 'completed', stats: { suspicious: 1, undetected: 90, harmless: 1 } },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({ apiKey: 'key' });

    const reports = await service.reportOn([URL_INDICATOR]);
    expect(reports[0]?.verdict).toBe('clean');
  });

  it('degrades to no report when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const service = makeService({ apiKey: 'key' });

    await expect(service.reportOn([URL_INDICATOR])).resolves.toEqual([]);
  });

  it('persists notable verdicts and dedupes them within the cache window', async () => {
    const rows: Array<Partial<VirusTotalVerdict>> = [];
    const repository = {
      findOne: vi.fn(async ({ where }: { where: { type: string; value: string } }) =>
        rows.find((row) => row.type === where.type && row.value === where.value),
      ),
      create: vi.fn((value: Partial<VirusTotalVerdict>) => ({ id: 1, createdAt: new Date(), ...value })),
      save: vi.fn(async (row: Partial<VirusTotalVerdict>) => {
        if (!rows.includes(row as never)) rows.push(row as never);
        return row;
      }),
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'analysis-1' } }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            data: { attributes: { status: 'completed', stats: { suspicious: 3, undetected: 40, harmless: 20 } } },
          }),
        ),
    );
    const service = makeService({ apiKey: 'key' }, repository);

    await service.reportOn([URL_INDICATOR]);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({
      type: 'url',
      value: URL_INDICATOR.value,
      verdict: 'suspicious',
      suspicious: 3,
    });

    await service.reportOn([URL_INDICATOR]);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it('does not persist clean or unknown verdicts', async () => {
    const repository = { findOne: vi.fn(), save: vi.fn(), create: vi.fn() };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { error: {} })));
    const service = makeService({ apiKey: 'key' }, repository);

    await service.reportOn([FILE_INDICATOR]);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('purges verdicts older than the retention window', async () => {
    let cutoff: Date | undefined;
    const deleteMock = vi.fn(async (criteria: { createdAt: { value: Date } }) => {
      cutoff = criteria.createdAt.value;
      return { affected: 4 };
    });
    const service = makeService({ apiKey: 'key' }, { delete: deleteMock });

    await expect(service.purgeOlderThan(THIRTY_DAYS_MS)).resolves.toBe(4);
    expect(cutoff?.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
