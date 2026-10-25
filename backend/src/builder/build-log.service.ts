import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { parseLogRef, rawLogUrl } from './build-log-url';
import { Build } from './builder.entity';

const LOG_FETCH_TIMEOUT_MS = 30 * 1000;

const LOG_FETCH_MAX_BYTES = 10 * 1024 * 1024;

@Injectable()
export class BuildLogService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Build) private readonly buildRepository: Repository<Build>,
    @InjectPinoLogger(BuildLogService.name) private readonly pino: PinoLogger,
  ) {}

  async capture(buildId: number | undefined, logUrl: string | undefined): Promise<void> {
    if (buildId === undefined || !logUrl) return;

    const ref = parseLogRef(logUrl);
    if (!ref) {
      this.pino.warn({ logUrl }, 'Could not read package name and timestamp from build log URL');
      return;
    }

    const content = await this.download(
      ref.pkgname,
      rawLogUrl(this.configService.getOrThrow('app.garudaLogsUrl'), ref),
    );
    if (content === null) return;

    await this.buildRepository.update(buildId, { logContent: content });
    this.pino.debug({ buildId, pkgname: ref.pkgname, bytes: content.length }, 'Stored build log');
  }

  private async download(pkgname: string, url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: { accept: 'text/plain, text/*' },
        signal: AbortSignal.timeout(LOG_FETCH_TIMEOUT_MS),
      });
      if (!response.ok || response.body === null) {
        this.pino.warn({ pkgname, status: response.status }, 'Could not fetch build log');
        return null;
      }

      return await this.readBody(pkgname, response.body);
    } catch (err: unknown) {
      this.pino.warn({ err, pkgname }, 'Failed to download build log');
      return null;
    }
  }

  private async readBody(pkgname: string, body: ReadableStream<Uint8Array>): Promise<string | null> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      bytes += value.byteLength;
      if (bytes > LOG_FETCH_MAX_BYTES) {
        await reader.cancel();
        this.pino.warn({ pkgname, maxBytes: LOG_FETCH_MAX_BYTES }, 'Build log exceeds the storage limit, skipping it');

        return null;
      }

      content += decoder.decode(value, { stream: true });
    }

    return content + decoder.decode();
  }
}
