import { NotificationPayload } from '@chaotic-next/shared-lib';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { NotificationService } from '../notifications/notification.service';
import { MoleculerBuildObject } from '../types/types';
import { type BuildFailureScan, isNotifiable, scanBuildLogForCause } from './build-failure-rules';
import { Build } from './builder.entity';
import { isFailingStatus } from './unresolved-failures';

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const LOG_FETCH_TIMEOUT_MS = 20 * 1000;
const LOG_FETCH_MAX_BYTES = 512 * 1024;
const MAX_BODY_LENGTH = 140;

interface LogRef {
  pkgname: string;
  timestamp: string;
}

function toBody(scan: BuildFailureScan): string {
  const body = scan.detail ? `${scan.label}: ${scan.detail}` : scan.label;
  return body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body;
}

/**
 * Fetches the tail of a raw build log. The failure markers live at the end, so
 * keeping only the last `maxBytes` avoids loading multi-megabyte logs.
 */
async function fetchLogTail(url: string, maxBytes: number): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/plain, text/*' },
      signal: AbortSignal.timeout(LOG_FETCH_TIMEOUT_MS),
    });
    if (!response.ok || response.body === null) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let tail = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      tail += decoder.decode(value, { stream: true });
      if (tail.length > maxBytes) tail = tail.slice(-maxBytes);
    }
    return tail;
  } catch {
    return null;
  }
}

@Injectable()
export class BuildFailureNotifierService {
  private readonly lastNotifiedAt = new Map<string, number>();

  constructor(
    @InjectPinoLogger(BuildFailureNotifierService.name) private readonly pino: PinoLogger,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    @InjectRepository(Build) private readonly buildRepository: Repository<Build>,
  ) {}

  /**
   * Scans the log of a failed build for a known cause and, when the cause is
   * actionable, notifies subscribers. Missing dependencies and transient
   * failures are skipped: they resolve without maintainer action.
   */
  async handleFailedBuild(params: MoleculerBuildObject): Promise<void> {
    if (params.status === undefined || !isFailingStatus(params.status) || !params.logUrl) return;

    const logRef = parseLogRef(params.logUrl);
    if (!logRef) {
      this.pino.warn({ logUrl: params.logUrl }, 'Could not read package name and timestamp from build log URL');
      return;
    }

    const rawLog = await fetchLogTail(this.rawLogUrl(logRef), LOG_FETCH_MAX_BYTES);
    if (rawLog === null) {
      this.pino.warn({ pkgname: logRef.pkgname }, 'Could not fetch build log for failure scan');
      return;
    }

    const scan = scanBuildLogForCause(rawLog);
    if (scan === null) {
      this.pino.debug({ pkgname: logRef.pkgname }, 'No known failure cause found in build log');
      return;
    }

    await this.persistFailureTags(params.logUrl, scan);

    if (!isNotifiable(scan)) {
      this.pino.info(
        { pkgname: logRef.pkgname, cause: scan.id, tags: scan.tags },
        'Skipped notification for self-resolving build failure',
      );
      return;
    }

    if (this.isOnCooldown(logRef.pkgname, scan.id)) {
      this.pino.debug({ pkgname: logRef.pkgname, cause: scan.id }, 'Build failure notification already sent recently');
      return;
    }
    this.rememberNotified(logRef.pkgname, scan.id);

    await this.notificationService.broadcast(
      this.toNotification(logRef.pkgname, logRef.timestamp, scan),
      'build-failure',
    );
  }

  private rawLogUrl(logRef: LogRef): string {
    const base = this.configService.getOrThrow<string>('app.garudaLogsUrl');
    return `${base}/${encodeURIComponent(logRef.pkgname)}/${logRef.timestamp}`;
  }

  private async persistFailureTags(logUrl: string, scan: BuildFailureScan): Promise<void> {
    await this.buildRepository.update({ logUrl }, { failureTags: [...scan.tags] });
  }

  private isOnCooldown(pkgname: string, causeId: string): boolean {
    const lastNotified = this.lastNotifiedAt.get(`${pkgname}:${causeId}`);
    return lastNotified !== undefined && Date.now() - lastNotified < NOTIFY_COOLDOWN_MS;
  }

  private rememberNotified(pkgname: string, causeId: string): void {
    this.lastNotifiedAt.set(`${pkgname}:${causeId}`, Date.now());
  }

  private toNotification(pkgname: string, timestamp: string, scan: BuildFailureScan): NotificationPayload {
    return {
      notification: {
        title: `Build failed: ${pkgname}`,
        icon: '/android-chrome-512x512.png',
        body: toBody(scan),
        data: {
          onActionClick: {
            default: {
              operation: 'navigateLastFocusedOrOpen',
              url: `https://aur.chaotic.cx/logs/package/${pkgname}/${timestamp}`,
            },
          },
        },
      },
    };
  }
}

/** Reads the package name and timestamp out of the build log URL. */
export function parseLogRef(logUrl: string): LogRef | null {
  try {
    const url = new URL(logUrl);
    const pkgname = url.searchParams.get('id') ?? url.searchParams.get('pkgname');
    const timestamp = url.searchParams.get('timestamp');
    if (pkgname !== null && timestamp !== null) return { pkgname, timestamp };
  } catch {
    // Malformed log URL; fall through to the path-based reading below.
  }

  const segments = logUrl.split('/').filter(Boolean);
  const [pkgname, timestamp] = segments.slice(-2);
  if (pkgname && timestamp) return { pkgname, timestamp };
  return null;
}
