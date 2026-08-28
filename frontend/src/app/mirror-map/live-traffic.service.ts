import { computed, inject, Service, signal } from '@angular/core';
import {
  LIVE_RPS_SSE_EVENT,
  liveRouterRpsSchema,
  liveTrafficHitSchema,
  type LiveTrafficHit,
} from '@chaotic-next/shared-lib';
import { APP_CONFIG } from '../../environments/app-config.token';
import type { EnvironmentModel } from '../../environments/environment.model';
import { ResilientSseStream } from '../sse-stream';

export type TrafficHit = LiveTrafficHit & { sourceCoordinates?: [number, number] | null };

const MAX_RECENT_HITS = 40;

@Service()
export class LiveTrafficService {
  private readonly appConfig: EnvironmentModel = inject(APP_CONFIG);
  private stream: ResilientSseStream | null = null;

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

  connect(): void {
    if (this.stream || this.isConnecting()) return;
    this.isConnecting.set(true);

    const url = `${this.appConfig.backendUrl}/metrics/live/traffic?ngsw-bypass`;
    this.stream = new ResilientSseStream({
      url: () => url,
      onMessage: (data) => {
        try {
          const parsed = liveTrafficHitSchema.safeParse(JSON.parse(data));
          if (parsed.success) {
            this.handleHit(parsed.data);
          }
        } catch (err) {
          console.warn('Failed to parse live traffic SSE message:', err);
        }
      },
      namedEvents: [LIVE_RPS_SSE_EVENT],
      onNamedEvent: (eventType, data) => {
        if (eventType !== LIVE_RPS_SSE_EVENT) return;
        try {
          const parsed = liveRouterRpsSchema.safeParse(JSON.parse(data));
          if (parsed.success && Number.isFinite(parsed.data.rps)) {
            this.currentReqPerSec.set(parsed.data.rps);
          }
        } catch (err) {
          console.warn('Failed to parse router RPS SSE message:', err);
        }
      },
      onOpen: () => {
        this.isConnected.set(true);
        this.isConnecting.set(false);
      },
      onErrorExhausted: () => {
        this.resetConnectionState();
      },
    });
    this.stream.open();
  }

  disconnect(): void {
    this.stream?.close();
    this.stream = null;
    this.resetConnectionState();
  }

  private resetConnectionState(): void {
    this.isConnected.set(false);
    this.isConnecting.set(false);
    this.currentReqPerSec.set(0);
  }

  private handleHit(hit: TrafficHit): void {
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
}
