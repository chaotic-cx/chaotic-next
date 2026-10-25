import { type ConfigService } from '@nestjs/config';
import { type PinoLogger } from 'nestjs-pino';
import { type Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildLogService } from './build-log.service';
import { Build } from './builder.entity';

const GARUDA_LOGS_URL = 'https://builds.garudalinux.org/logs/api/logs';
const LOG_URL = 'https://builds.garudalinux.org/logs/logs.html?timestamp=1724300000000&id=spotdl';
const RAW_LOG = '==> Starting build()...\n==> Build finished.';

describe('BuildLogService', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const update = vi.fn().mockResolvedValue({ affected: 1 });
  const pino = { warn: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
  const configService = { getOrThrow: vi.fn(() => GARUDA_LOGS_URL) } as unknown as ConfigService;
  const buildRepository = { update } as unknown as Repository<Build>;
  let service: BuildLogService;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(RAW_LOG, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    service = new BuildLogService(configService, buildRepository, pino);
  });

  it('stores the raw log on the build row', async () => {
    await service.capture(42, LOG_URL);

    expect(fetchMock).toHaveBeenCalledWith(
      `${GARUDA_LOGS_URL}/spotdl/1724300000000`,
      expect.objectContaining({ headers: { accept: 'text/plain, text/*' } }),
    );
    expect(update).toHaveBeenCalledWith(42, { logContent: RAW_LOG });
  });

  it('skips builds without a log URL', async () => {
    await service.capture(42, undefined);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('skips builds without an id', async () => {
    await service.capture(undefined, LOG_URL);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips log URLs it cannot parse', async () => {
    await service.capture(42, 'not-a-url');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(pino.warn).toHaveBeenCalled();
  });

  it('does not store a log when the build server returns an error', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));

    await service.capture(42, LOG_URL);

    expect(update).not.toHaveBeenCalled();
    expect(pino.warn).toHaveBeenCalled();
  });

  it('does not store a log larger than the storage limit', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 11; index += 1) controller.enqueue(chunk);

        controller.close();
      },
    });
    fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));

    await service.capture(42, LOG_URL);

    expect(update).not.toHaveBeenCalled();
    expect(pino.warn).toHaveBeenCalled();
  });

  it('swallows fetch failures', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service.capture(42, LOG_URL)).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
