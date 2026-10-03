import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LiveTrafficService } from '../mirror-map/live-traffic.service';
import { UnknownValueComponent } from '../ui-states/unknown-value.component';

@Component({
  selector: 'chaotic-live-traffic-feed',
  imports: [DatePipe, TranslocoDirective, UnknownValueComponent],
  template: `
    <div
      class="live-feed-card mt-4 rounded-xl border border-ctp-surface0 p-4 backdrop-blur-(--chaotic-blur)"
      *transloco="let t; prefix: 'map.liveFeed'"
    >
      <div
        class="flex flex-col items-center gap-3 border-b border-ctp-surface0 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-3 sm:order-1">
          <div class="relative flex h-3 w-3 items-center justify-center" aria-hidden="true">
            @if (trafficService.isConnected()) {
              <span
                class="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-ctp-green opacity-75"
              ></span>
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-ctp-green"></span>
            } @else if (trafficService.isConnecting()) {
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-ctp-yellow"></span>
            } @else {
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-ctp-overlay0"></span>
            }
          </div>
          <span class="sr-only" role="status">
            @if (trafficService.isConnected()) {
              {{ t('connection.connected') }}
            } @else if (trafficService.isConnecting()) {
              {{ t('connection.connecting') }}
            } @else {
              {{ t('connection.disconnected') }}
            }
          </span>
          <span class="font-bold text-ctp-text">{{ t('title') }}</span>
        </div>

        <div class="grid w-full grid-cols-3 gap-2 text-xs font-semibold sm:flex sm:w-auto sm:order-3">
          <button
            class="feed-toggle flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200"
            [class.bg-ctp-blue]="trafficService.showHits()"
            [class.text-ctp-crust]="trafficService.showHits()"
            [class.border-ctp-blue]="trafficService.showHits()"
            [class.bg-ctp-surface0]="!trafficService.showHits()"
            [class.text-ctp-overlay1]="!trafficService.showHits()"
            [class.border-ctp-surface1]="!trafficService.showHits()"
            [attr.aria-pressed]="trafficService.showHits()"
            (click)="trafficService.toggleHits()"
            type="button"
          >
            <i class="text-xs" [class]="trafficService.showHits() ? 'pi pi-bolt' : 'pi pi-eye-slash'"></i>
            <span>{{ t('toggleHits') }}</span>
          </button>

          <button
            class="feed-toggle flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200"
            [class.bg-ctp-peach]="trafficService.mapProjection() === 'globe'"
            [class.text-ctp-crust]="trafficService.mapProjection() === 'globe'"
            [class.border-ctp-peach]="trafficService.mapProjection() === 'globe'"
            [class.bg-ctp-surface0]="trafficService.mapProjection() !== 'globe'"
            [class.text-ctp-overlay1]="trafficService.mapProjection() !== 'globe'"
            [class.border-ctp-surface1]="trafficService.mapProjection() !== 'globe'"
            (click)="trafficService.toggleProjection()"
            type="button"
          >
            <i class="text-xs" [class]="trafficService.mapProjection() === 'globe' ? 'pi pi-compass' : 'pi pi-map'"></i>
            <span>{{ trafficService.mapProjection() === 'globe' ? t('globe') : t('flatMap') }}</span>
          </button>

          <button
            class="feed-toggle flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors duration-200"
            [class.bg-ctp-mauve]="trafficService.showMirrors()"
            [class.text-ctp-crust]="trafficService.showMirrors()"
            [class.border-ctp-mauve]="trafficService.showMirrors()"
            [class.bg-ctp-surface0]="!trafficService.showMirrors()"
            [class.text-ctp-overlay1]="!trafficService.showMirrors()"
            [class.border-ctp-surface1]="!trafficService.showMirrors()"
            [attr.aria-pressed]="trafficService.showMirrors()"
            (click)="trafficService.toggleMirrors()"
            type="button"
          >
            <i class="text-xs" [class]="trafficService.showMirrors() ? 'pi pi-globe' : 'pi pi-eye-slash'"></i>
            <span>{{ t('toggleMirrors') }}</span>
          </button>
        </div>

        <div
          class="flex items-center gap-4 text-xs font-medium text-ctp-subtext0 sm:order-2 sm:border-l sm:border-ctp-surface0 sm:pl-3"
        >
          <div class="flex items-center gap-1.5">
            <span class="text-ctp-text font-bold text-sm">
              @if (trafficService.isConnected()) {
                {{ trafficService.currentReqPerSec() }}
              } @else {
                <chaotic-unknown-value />
              }
            </span>
            <span>{{ t('requestsPerSecond') }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-ctp-text font-bold text-sm">{{ trafficService.totalHitsReceived() }}</span>
            <span>{{ t('hits') }}</span>
          </div>
        </div>
      </div>

      <div class="mt-3 flex min-h-[28px] flex-wrap items-center justify-between gap-2 text-xs">
        @if (trafficService.isConnected() || trafficService.totalHitsReceived() > 0) {
          <div class="flex items-center gap-2">
            <span class="text-ctp-subtext1">{{ t('topCountries') }}</span>
            <div class="flex flex-wrap gap-1.5">
              @for (item of trafficService.topCountries(); track item.country) {
                <span class="rounded bg-ctp-surface0 px-2 py-0.5 text-ctp-mauve font-medium">
                  {{ item.country }}: <span class="font-bold text-ctp-text">{{ item.count }}</span>
                </span>
              }
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-ctp-subtext1">{{ t('topRepos') }}</span>
            <div class="flex flex-wrap gap-1.5">
              @for (item of trafficService.topRepos(); track item.repo) {
                <span class="rounded bg-ctp-surface0 px-2 py-0.5 text-ctp-sapphire font-medium">
                  {{ item.repo }}: <span class="font-bold text-ctp-text">{{ item.count }}</span>
                </span>
              }
            </div>
          </div>
        }
      </div>

      <div class="traffic-river mt-3 h-56 overflow-y-auto text-xs text-ctp-subtext1">
        @if (trafficService.recentHits().length === 0) {
          <div class="flex h-full flex-wrap items-center justify-center gap-2 text-ctp-overlay1">
            @if (trafficService.isConnected()) {
              {{ t('waiting') }}
            } @else if (trafficService.isConnecting()) {
              <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>{{ t('connection.connecting') }}
            } @else {
              {{ t('disconnectedHint') }}
              <button class="feed-reconnect" (click)="trafficService.connect()" type="button">
                {{ t('reconnect') }}
              </button>
            }
          </div>
        } @else {
          <div class="flex flex-col gap-1.5">
            @for (hit of trafficService.recentHits(); track hit.id) {
              <div
                class="traffic-row flex items-center gap-3 rounded bg-ctp-surface0/50 px-2.5 py-1.5 transition-colors hover:bg-ctp-surface0"
              >
                <span class="text-xs text-ctp-overlay1 font-medium">
                  {{ hit.timestamp | date: 'mediumTime' }}
                </span>
                <span class="rounded bg-ctp-crust px-2 py-0.5 text-center font-bold text-ctp-peach tracking-wide">
                  {{ hit.countryCode }}
                </span>
                <span class="rounded bg-ctp-crust/60 px-2 py-0.5 font-semibold text-ctp-sapphire">
                  {{ hit.repo }}
                </span>
                <span
                  class="hidden truncate max-w-xs font-normal text-ctp-subtext0 sm:block sm:max-w-md"
                  [title]="hit.userAgent"
                >
                  {{ hit.userAgent }}
                </span>
                <span class="ml-auto text-xs text-ctp-overlay1 font-medium">
                  {{ shortHostname(hit.hostname) }}
                </span>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .traffic-river::-webkit-scrollbar {
        width: 6px;
      }
      .traffic-river::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--catppuccin-color-overlay2) 20%, transparent);
        border-radius: var(--chaotic-radius-sm);
      }
      .traffic-river::-webkit-scrollbar-thumb:hover {
        background: color-mix(in srgb, var(--catppuccin-color-overlay2) 40%, transparent);
      }
      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .traffic-row {
        animation: fadeSlideIn var(--chaotic-duration-base) var(--chaotic-ease-out);
      }
      @media (prefers-reduced-motion: reduce) {
        .traffic-row {
          animation: none;
        }
      }
      .feed-reconnect {
        padding: 0.25rem 0.625rem;
        border: 1px solid var(--chaotic-border);
        border-radius: var(--chaotic-radius-sm);
        font-size: 0.8125rem;
        font-weight: var(--chaotic-weight-semibold);
        color: var(--catppuccin-color-text);
        cursor: pointer;
      }
      .feed-reconnect:hover,
      .feed-reconnect:focus-visible {
        border-color: var(--catppuccin-color-mauve);
      }
      @media (pointer: coarse) {
        .feed-toggle {
          min-height: 2.75rem;
        }
      }
    `,
  ],
})
export class LiveTrafficFeedComponent {
  protected readonly trafficService = inject(LiveTrafficService);

  private readonly isMobile = window.matchMedia('(pointer: coarse)').matches;

  /** Mobile rows are too narrow for full hostnames; drop the shared suffix. */
  protected shortHostname(hostname: string): string {
    const suffix = '.chaotic.cx';
    return this.isMobile && hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : hostname;
  }
}
