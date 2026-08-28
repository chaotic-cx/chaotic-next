import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PinoLogger } from 'nestjs-pino';
import { provideRuleDataStore } from './rules/rule-data-store';
import { RuleDataService } from './rule-data.service';

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;

function makeRepository() {
  const rows = new Map<string, { cacheKey: string; raw: string }>();
  return {
    findOne: vi.fn(async ({ where }: { where: { cacheKey: string } }) => rows.get(where.cacheKey) ?? null),
    upsert: vi.fn(async (row: { cacheKey: string; raw: string }) => {
      rows.set(row.cacheKey, row);
    }),
    rows,
  };
}

describe('RuleDataService', () => {
  let repository: ReturnType<typeof makeRepository>;
  let service: RuleDataService;

  beforeEach(() => {
    repository = makeRepository();
    service = new RuleDataService(pinoStub, repository as never);
  });

  it('registers itself as the rule-data store when a repository is available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('payload', { status: 200 })));
    const { remoteDataLoader } = await import('./rules/rule');
    service.onModuleInit();

    const loader = remoteDataLoader<string>({
      url: 'https://blocklist.example/list',
      transform: (raw: string) => raw,
      cacheKey: 'wired-feed',
    });
    await loader();

    expect(repository.rows.get('wired-feed')?.raw).toBe('payload');
    provideRuleDataStore(null);
    vi.unstubAllGlobals();
  });

  it('serves persisted payloads and survives read errors', async () => {
    await service.save('feed', 'raw-list');
    expect(await service.load('feed')).toBe('raw-list');
    expect(await service.load('unknown')).toBeNull();

    repository.findOne.mockRejectedValueOnce(new Error('database down'));
    expect(await service.load('feed')).toBeNull();
  });

  it('survives persist errors without throwing', async () => {
    repository.upsert.mockRejectedValueOnce(new Error('database down'));
    await expect(service.save('feed', 'raw-list')).resolves.toBeUndefined();
    expect(repository.rows.has('feed')).toBe(false);
  });
});
