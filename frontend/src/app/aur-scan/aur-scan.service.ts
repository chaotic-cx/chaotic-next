import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import {
  type AurPackageScan,
  type AurScanMetrics,
  type AurScanStreamChunk,
  aurScanStreamChunkSchema,
} from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { ResilientSseStream } from '../sse-stream';

const HTTP_TOO_MANY_REQUESTS = 429;
const GENERIC_SCAN_ERROR_MESSAGE = 'Could not scan the AUR package. Does it exist?';
const RATE_LIMITED_SCAN_ERROR_MESSAGE = 'Too many scans have been started. Please wait a minute and try again.';

export function isScanSettled(scan: AurPackageScan | undefined): boolean {
  return scan?.status === 'done' || scan?.status === 'failed';
}

@Service()
export class AurScanService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);

  readonly scans = signal<ReadonlyMap<string, AurPackageScan>>(new Map());
  readonly metrics = signal<AurScanMetrics | null>(null);

  private readonly streams = new Map<string, ResilientSseStream>();

  scanOf(packageName: string): AurPackageScan | undefined {
    return this.scans().get(packageName.trim().toLowerCase());
  }

  async loadMetrics(): Promise<void> {
    try {
      this.metrics.set(await this.getMetrics());
    } catch {
      this.metrics.set(null);
    }
  }

  async startScan(packageName: string): Promise<void> {
    const name = packageName.trim();
    if (!name || this.scanOf(name)) return;

    try {
      const scan = await lastValueFrom(
        this.http.post<AurPackageScan>(`${this.backendUrl}/gitlab/aur-scan`, { package: name }),
      );
      this.store(scan);
      this.metrics.update((m) => (m ? { ...m, total: m.total + 1, anonymous: m.anonymous + 1 } : m));

      if (!isScanSettled(scan)) this.openStream(scan.packageName);
    } catch (error) {
      this.messageToastService.error('Scan failed', this.errorMessageFor(error));
      console.error('AUR scan failed:', error);
    }
  }

  private errorMessageFor(error: unknown): string {
    return error instanceof HttpErrorResponse && error.status === HTTP_TOO_MANY_REQUESTS
      ? RATE_LIMITED_SCAN_ERROR_MESSAGE
      : GENERIC_SCAN_ERROR_MESSAGE;
  }

  private openStream(packageName: string): void {
    const key = packageName.toLowerCase();
    if (this.streams.has(key)) return;

    const stream = new ResilientSseStream({
      url: () => `${this.backendUrl}/gitlab/aur-scan/${encodeURIComponent(packageName)}/stream?ngsw-bypass`,
      onMessage: (data) => {
        const chunk = parseChunk(data);
        if (!chunk) return;
        this.store(chunk.scan);
        if (chunk.complete) this.closeStream(chunk.scan.packageName);
      },
      // A settled scan closes its own stream; exhaustion only frees the key
      // so a fresh startScan can open a new one.
      onErrorExhausted: () => this.streams.delete(key),
    });
    this.streams.set(key, stream);
    stream.open();
  }

  private closeStream(packageName: string): void {
    const key = packageName.toLowerCase();
    this.streams.get(key)?.close();
    this.streams.delete(key);
  }

  private store(scan: AurPackageScan): void {
    this.scans.update((scans) => new Map(scans).set(scan.packageName.toLowerCase(), scan));
  }

  async getMetrics(): Promise<AurScanMetrics> {
    return lastValueFrom(this.http.get<AurScanMetrics>(`${this.backendUrl}/gitlab/aur-scan/metrics`));
  }
}

function parseChunk(raw: string): AurScanStreamChunk | null {
  try {
    const result = aurScanStreamChunkSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
