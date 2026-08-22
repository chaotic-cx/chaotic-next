import { computed, inject, Service, signal } from '@angular/core';
import type { LiveTrafficHit } from '@chaotic-next/shared-lib';
import { APP_CONFIG } from '../../environments/app-config.token';
import type { EnvironmentModel } from '../../environments/environment.model';

export type TrafficHit = LiveTrafficHit & { sourceCoordinates?: [number, number] | null };

const MAX_RECENT_HITS = 40;
const STATS_WINDOW_MS = 10_000;

@Service()
export class LiveTrafficService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private readonly hitTimestamps: number[] = [];
  private rateIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly isConnected = signal(false);
  readonly isConnecting = signal(false);
  readonly recentHits = signal<TrafficHit[]>([]);
  readonly currentReqPerSec = signal(0);
  readonly totalHitsReceived = signal(0);
  readonly countryHitCounts = signal<Record<string, number>>({});
  readonly repoHitCounts = signal<Record<string, number>>({});

  readonly latestHit = signal<TrafficHit | null>(null);

  readonly showHits = signal(true);
  readonly showMirrors = signal(true);
  readonly mapProjection = signal<'globe' | 'flat'>('globe');

  toggleHits(): void {
    this.showHits.update((v) => !v);
  }

  toggleMirrors(): void {
    this.showMirrors.update((v) => !v);
  }

  toggleProjection(): void {
    this.mapProjection.update((v) => (v === 'globe' ? 'flat' : 'globe'));
  }

  readonly topCountries = computed(() => {
    const counts = this.countryHitCounts();
    return Object.entries(counts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  });

  readonly topRepos = computed(() => {
    const counts = this.repoHitCounts();
    return Object.entries(counts)
      .map(([repo, count]) => ({ repo, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  });

  private eventSource: EventSource | null = null;

  connect(): void {
    if (this.isConnected() || this.isConnecting()) return;

    this.isConnecting.set(true);
    this.startRateCalculation();

    const url = `${this.appConfig.backendUrl}/metrics/live/traffic?ngsw-bypass`;
    const source = new EventSource(url);
    this.eventSource = source;

    source.onopen = () => {
      this.isConnected.set(true);
      this.isConnecting.set(false);
    };

    source.onmessage = (event) => {
      try {
        const hit: LiveTrafficHit = JSON.parse(event.data);
        if (hit && hit.countryCode) {
          this.handleHit(hit);
        }
      } catch (err) {
        console.warn('Failed to parse live traffic SSE message:', err);
      }
    };

    source.onerror = () => {
      this.disconnect();
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected.set(false);
    this.isConnecting.set(false);
    this.stopRateCalculation();
  }

  private handleHit(hit: TrafficHit): void {
    const now = Date.now();
    this.hitTimestamps.push(now);

    this.latestHit.set(hit);
    this.totalHitsReceived.update((c) => c + 1);

    this.recentHits.update((hits) => [hit, ...hits.slice(0, MAX_RECENT_HITS - 1)]);

    this.countryHitCounts.update((counts) => {
      const count = (counts[hit.countryCode] ?? 0) + 1;
      return { ...counts, [hit.countryCode]: count };
    });

    this.repoHitCounts.update((counts) => {
      const count = (counts[hit.repo] ?? 0) + 1;
      return { ...counts, [hit.repo]: count };
    });
  }

  private startRateCalculation(): void {
    this.stopRateCalculation();
    this.rateIntervalId = setInterval(() => {
      const now = Date.now();
      const cutoff = now - STATS_WINDOW_MS;

      while (this.hitTimestamps.length > 0 && this.hitTimestamps[0] < cutoff) {
        this.hitTimestamps.shift();
      }

      const rps = this.hitTimestamps.length / (STATS_WINDOW_MS / 1000);
      this.currentReqPerSec.set(Math.round(rps * 10) / 10);
    }, 1000);
  }

  private stopRateCalculation(): void {
    if (this.rateIntervalId) {
      clearInterval(this.rateIntervalId);
      this.rateIntervalId = null;
    }
    this.currentReqPerSec.set(0);
  }
}
