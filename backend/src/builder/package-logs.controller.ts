import { GitlabLogChunk, offsetQuerySchema } from '@chaotic-next/shared-lib';
import { Controller, NotFoundException, Param, Query, ServiceUnavailableException, Sse } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiParam, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';

const DEFAULT_RESUME_OFFSET = 0;

interface PackageLogClient {
  lastOffset: number;
  next: (message: Partial<MessageEvent<GitlabLogChunk>>) => void;
  complete: () => void;
  error: (err: unknown) => void;
}

interface PackageLogEntry {
  clients: Set<PackageLogClient>;
  controller?: AbortController;
  /** Full text received so far, so mid-stream joiners can be caught up. */
  text: string;
}

@ApiTags('logs')
@Controller('logs')
export class PackageLogsController {
  /** Shared log streams keyed by `pkgname/timestamp`; one upstream fetch per watched log. */
  private readonly packageLogs = new Map<string, PackageLogEntry>();

  constructor(private readonly configService: ConfigService) {}

  @Sse(':pkgname/:timestamp')
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'timestamp', description: 'Build timestamp' })
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream a package build log from the build server.' })
  @ApiOkResponse({ description: 'Stream of GitlabLogChunk messages', type: Object })
  @ApiQuery({ name: 'offset', required: false, description: 'Resume from this character offset', type: Number })
  getPackageLog(
    @Param('pkgname') pkgname: string,
    @Param('timestamp') timestamp: string,
    @Query('offset', { schema: offsetQuerySchema.default(DEFAULT_RESUME_OFFSET) }) offset: number,
  ): Observable<Partial<MessageEvent<GitlabLogChunk>>> {
    const base = this.configService.getOrThrow<string>('app.garudaLogsUrl');
    const url = `${base}/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
    const key = `${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;

    return new Observable((subscriber) => {
      const client: PackageLogClient = {
        // Chunks report an absolute cumulative character offset so a resumed
        // client can reconnect again without receiving duplicates.
        lastOffset: Math.max(offset, DEFAULT_RESUME_OFFSET),
        next: (message) => subscriber.next(message),
        complete: () => subscriber.complete(),
        error: (err) => subscriber.error(err),
      };
      this.attachClient(key, url, client);
      return () => this.detachClient(key, client);
    });
  }

  private attachClient(key: string, url: string, client: PackageLogClient): void {
    let entry = this.packageLogs.get(key);
    if (!entry) {
      entry = { clients: new Set(), text: '' };
      this.packageLogs.set(key, entry);
      void this.streamPackageLog(key, url);
    } else {
      this.sendPackageLogChunk(entry, client);
    }
    entry.clients.add(client);
  }

  private detachClient(key: string, client: PackageLogClient): void {
    const entry = this.packageLogs.get(key);
    if (!entry) return;
    entry.clients.delete(client);
    if (entry.clients.size === 0) this.disposeEntry(key);
  }

  private sendPackageLogChunk(entry: PackageLogEntry, client: PackageLogClient): void {
    if (entry.text.length <= client.lastOffset) return;
    const offset = entry.text.length;
    client.next({
      data: { offset, text: entry.text.slice(client.lastOffset), complete: false, status: '' },
    });
    client.lastOffset = offset;
  }

  private async streamPackageLog(key: string, url: string): Promise<void> {
    const entry = this.packageLogs.get(key);
    if (!entry) return;

    // Aborting on teardown cancels the upstream fetch so the last disconnecting
    // client does not leave the build-server connection dangling.
    const upstream = new AbortController();
    entry.controller = upstream;

    try {
      const response = await fetch(url, { signal: upstream.signal });
      if (response.status === 404) throw new NotFoundException('Build log not found');
      if (!response.ok || !response.body) throw new ServiceUnavailableException('Could not fetch build log');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (!upstream.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        // Resume is expressed in characters, not bytes, to match the offset the chunks report.
        entry.text += decoder.decode(value, { stream: true });
        for (const client of [...entry.clients]) this.sendPackageLogChunk(entry, client);
      }

      for (const client of [...entry.clients]) {
        client.next({ data: { offset: client.lastOffset, text: '', complete: true, status: '' } });
        client.complete();
      }
      this.disposeEntry(key);
    } catch (error) {
      if (!upstream.signal.aborted) {
        for (const client of [...entry.clients]) client.error(error);
      }
      this.disposeEntry(key);
    }
  }

  private disposeEntry(key: string): void {
    const entry = this.packageLogs.get(key);
    if (!entry) return;
    entry.controller?.abort();
    this.packageLogs.delete(key);
  }
}
