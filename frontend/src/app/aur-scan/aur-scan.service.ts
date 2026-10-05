import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Service, signal, untracked } from '@angular/core';
import {
  type AurPackageScan,
  type AurScanMetrics,
  type AurScanStreamChunk,
  aurScanStreamChunkSchema,
} from '@chaotic-next/shared-lib';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { requestFailure } from '../api-errors';
import { ResilientSseStream } from '../sse-stream';

/**
 * Why a scan has no result.
 * `rateLimited`: too many scans started. `request`: the scan request failed.
 * `streamLost`: the scan started, but its progress stream dropped.
 */
export type ScanFailureReason = 'rateLimited' | 'request' | 'streamLost';

export interface ScanFailure {
  reason: ScanFailureReason;
  error: unknown;
}

export function isScanSettled(scan: AurPackageScan | undefined): boolean {
  return scan?.status === 'done' || scan?.status === 'failed';
}

@Service()
export class AurScanService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);

  readonly scans = signal<ReadonlyMap<string, AurPackageScan>>(new Map());
  readonly failures = signal<ReadonlyMap<string, ScanFailure>>(new Map());
  private readonly metricsRequested = signal(false);
  private readonly metricsResource = httpResource<AurScanMetrics>(() =>
    this.metricsRequested() ? `${this.backendUrl}/gitlab/aur-scan/metrics` : undefined,
  );
  readonly metrics = computed(() => (this.metricsResource.hasValue() ? this.metricsResource.value() : null));

  private readonly streams = new Map<string, ResilientSseStream>();

  scanOf(packageName: string): AurPackageScan | undefined {
    return this.scans().get(scanKey(packageName));
  }

  failureOf(packageName: string): ScanFailure | undefined {
    return this.failures().get(scanKey(packageName));
  }

  /**
   * Starts a failed scan again. A lost stream only reconnects, because the scan itself runs on.
   */
  retry(packageName: string): void {
    const failure = this.failureOf(packageName);
    this.clearFailure(packageName);

    const scan = this.scanOf(packageName);
    if (failure?.reason === 'streamLost' && scan) {
      this.openStream(scan.packageName);
      return;
    }

    void this.startScan(packageName);
  }

  /**
   * The admin pages share this service, so the metrics load only after the scan page asks for them.
   * Every later visit refreshes them.
   */
  loadMetrics(): void {
    if (untracked(this.metricsRequested)) {
      this.metricsResource.reload();
      return;
    }

    this.metricsRequested.set(true);
  }

  async startScan(packageName: string): Promise<void> {
    const name = packageName.trim();
    if (!name || this.scanOf(name) || this.failureOf(name)) return;

    try {
      const scan = await lastValueFrom(
        this.http.post<AurPackageScan>(`${this.backendUrl}/gitlab/aur-scan`, { package: name }),
      );
      this.store(scan);
      this.countStartedScan();

      if (!isScanSettled(scan)) this.openStream(scan.packageName);
    } catch (error) {
      const reason = requestFailure(error) === 'rateLimited' ? 'rateLimited' : 'request';
      this.setFailure(name, { reason, error });
      console.error('AUR scan failed:', error);
    }
  }

  private countStartedScan(): void {
    if (!this.metricsResource.hasValue()) return;

    const metrics = this.metricsResource.value();
    this.metricsResource.value.set({ ...metrics, total: metrics.total + 1, anonymous: metrics.anonymous + 1 });
  }

  private setFailure(packageName: string, failure: ScanFailure): void {
    this.failures.update((failures) => new Map(failures).set(scanKey(packageName), failure));
  }

  private clearFailure(packageName: string): void {
    this.failures.update((failures) => {
      const next = new Map(failures);
      next.delete(scanKey(packageName));
      return next;
    });
  }

  private openStream(packageName: string): void {
    const key = scanKey(packageName);
    if (this.streams.has(key)) return;

    const stream = new ResilientSseStream({
      url: () => `${this.backendUrl}/gitlab/aur-scan/${encodeURIComponent(packageName)}/stream?ngsw-bypass`,
      onMessage: (data) => {
        const chunk = parseChunk(data);
        if (!chunk) return;
        this.store(chunk.scan);
        if (chunk.complete) this.closeStream(chunk.scan.packageName);
      },
      // A settled scan closes its own stream. Exhaustion frees the key and reports the lost stream.
      onErrorExhausted: () => {
        this.streams.delete(key);
        this.setFailure(packageName, { reason: 'streamLost', error: undefined });
      },
    });
    this.streams.set(key, stream);
    stream.open();
  }

  private closeStream(packageName: string): void {
    const key = scanKey(packageName);
    this.streams.get(key)?.close();
    this.streams.delete(key);
  }

  private store(scan: AurPackageScan): void {
    this.scans.update((scans) => new Map(scans).set(scanKey(scan.packageName), scan));
  }
}

function scanKey(packageName: string): string {
  return packageName.trim().toLowerCase();
}

function parseChunk(raw: string): AurScanStreamChunk | null {
  try {
    const result = aurScanStreamChunkSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
