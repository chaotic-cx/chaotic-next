import { type NotificationPayload } from '@chaotic-next/shared-lib';
import { type ConfigService } from '@nestjs/config';
import { type PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type NotificationService } from '../notifications/notification.service';
import { type Repository } from 'typeorm';
import { BuildStatus, type MoleculerBuildObject } from '../types/types';
import { scanBuildLogForCause } from './build-failure-rules';
import { BuildFailureNotifierService, parseLogRef } from './build-failure-notifier.service';
import { Build } from './builder.entity';

vi.mock('./build-failure-rules', async (importOriginal) => {
  const original = await importOriginal<typeof import('./build-failure-rules')>();
  return {
    ...original,
    scanBuildLogForCause: vi.fn(),
  };
});

const GARUDA_LOGS_URL = 'https://builds.garudalinux.org/logs/api/logs';
const RAW_LOG = '==> ERROR: A failure occurred in build().';

function failedBuild(status: BuildStatus = BuildStatus.FAILED): MoleculerBuildObject {
  return {
    arch: 'x86_64',
    build_class: 'common',
    builder_name: 'builder-1',
    logUrl: 'https://builds.garudalinux.org/logs/logs.html?timestamp=1724300000000&id=spotdl',
    pkgname: 'spotdl',
    replaced: false,
    status,
    target_repo: 'chaotic-aur',
    duration: 120,
    timestamp: 1724300000,
  };
}

describe('BuildFailureNotifierService', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const broadcast = vi.fn().mockResolvedValue(0);
  const buildRepository = {
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository<Build>;
  const pino = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as PinoLogger;
  const configService = {
    getOrThrow: vi.fn((key: string) => (key === 'app.garudaLogsUrl' ? GARUDA_LOGS_URL : '')),
    get: vi.fn((key: string) => (key === 'app.notifyBuildFailures' ? true : false)),
  };
  let service: BuildFailureNotifierService;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(RAW_LOG, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    service = new BuildFailureNotifierService(
      pino,
      configService as unknown as ConfigService,
      { broadcast } as unknown as NotificationService,
      buildRepository,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the raw log and notifies for an actionable cause', async () => {
    vi.mocked(scanBuildLogForCause).mockReturnValue({
      id: 'linker-error',
      label: 'Linker error',
      tags: ['link', 'compile'],
      snippet: 'collect2: error: ld returned 1 exit status',
    });

    await service.handleFailedBuild(failedBuild());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://builds.garudalinux.org/logs/api/logs/spotdl/1724300000000',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(buildRepository.update).toHaveBeenCalledWith(
      { logUrl: 'https://builds.garudalinux.org/logs/logs.html?timestamp=1724300000000&id=spotdl' },
      { failureTags: ['link', 'compile'] },
    );
    const payload = broadcast.mock.calls[0]?.[0] as NotificationPayload;
    expect(broadcast.mock.calls[0]?.[1]).toBe('build-failure');
    expect(payload.notification.title).toBe('Build failed: spotdl');
    expect(payload.notification.body).toBe('Linker error: collect2: error: ld returned 1 exit status');
    expect(payload.notification.data.onActionClick.default).toEqual({
      operation: 'navigateLastFocusedOrOpen',
      url: 'https://aur.chaotic.cx/logs/package/spotdl/1724300000000',
    });
  });

  it('persists the tags of silent causes without notifying', async () => {
    vi.mocked(scanBuildLogForCause).mockReturnValue({
      id: 'missing-dependency',
      label: 'Missing dependency',
      tags: ['dependency', 'silent'],
      snippet: 'error: target not found: python-spotipyfree',
    });

    await service.handleFailedBuild(failedBuild());

    expect(buildRepository.update).toHaveBeenCalledWith(
      { logUrl: 'https://builds.garudalinux.org/logs/logs.html?timestamp=1724300000000&id=spotdl' },
      { failureTags: ['dependency', 'silent'] },
    );
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('leaves the tags empty when no known cause matches', async () => {
    vi.mocked(scanBuildLogForCause).mockReturnValue(null);

    await service.handleFailedBuild(failedBuild());

    expect(buildRepository.update).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('does not notify twice for the same package and cause', async () => {
    vi.mocked(scanBuildLogForCause).mockReturnValue({
      id: 'make-error',
      label: 'Make error',
      tags: ['compile'],
      snippet: 'make: *** [all] Error 2',
    });

    const build = failedBuild();
    await service.handleFailedBuild(build);
    await service.handleFailedBuild(build);

    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it('recovers the cooldown after 24 hours', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(scanBuildLogForCause).mockReturnValue({
        id: 'make-error',
        label: 'Make error',
        tags: ['compile'],
        snippet: 'make: *** [all] Error 2',
      });

      const build = failedBuild();
      await service.handleFailedBuild(build);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      await service.handleFailedBuild(build);

      expect(broadcast).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing for a non-failing status', async () => {
    await service.handleFailedBuild(failedBuild(BuildStatus.SUCCESS));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(buildRepository.update).not.toHaveBeenCalled();
  });

  it('does nothing when the build has no log URL', async () => {
    await service.handleFailedBuild({ ...failedBuild(), logUrl: undefined });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(buildRepository.update).not.toHaveBeenCalled();
  });

  it('stays quiet when the log cannot be fetched', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));

    await service.handleFailedBuild(failedBuild());

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('truncates an overlong notification body', async () => {
    vi.mocked(scanBuildLogForCause).mockReturnValue({
      id: 'compiler-fatal-error',
      label: 'Compiler error',
      tags: ['compile'],
      snippet: 'x'.repeat(500),
    });

    await service.handleFailedBuild(failedBuild());

    const payload = broadcast.mock.calls[0]?.[0] as NotificationPayload;
    expect(payload.notification.body.length).toBeLessThanOrEqual(220);
  });
});

describe('parseLogRef', () => {
  it('reads the package and timestamp from query parameters', () => {
    expect(parseLogRef('https://builds.garudalinux.org/logs/logs.html?timestamp=1724300000000&id=spotdl')).toEqual({
      pkgname: 'spotdl',
      timestamp: '1724300000000',
    });
  });

  it('reads the package and timestamp from the path', () => {
    expect(parseLogRef('https://builds.garudalinux.org/logs/api/logs/spotdl/1724300000000')).toEqual({
      pkgname: 'spotdl',
      timestamp: '1724300000000',
    });
  });

  it('returns null for a malformed URL', () => {
    expect(parseLogRef('not-a-url')).toBeNull();
  });
});
