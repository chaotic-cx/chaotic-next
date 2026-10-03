import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Mirror } from '@chaotic-next/shared-lib';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

const COORDINATE_DECIMALS = 2;

export type MirrorStatus = 'online' | 'outdated' | 'offline';

const STATUS_DOT_CLASSES: Record<MirrorStatus, string> = {
  online: 'bg-ctp-green',
  outdated: 'bg-ctp-peach',
  offline: 'bg-ctp-red',
};

@Component({
  selector: 'chaotic-mirror-row',
  imports: [DatePipe, RelativeTimePipe, Tooltip, RouterLink],
  host: { class: 'chaotic-row' },
  template: `
    <span class="size-2 shrink-0 rounded-full" [class]="statusDotClasses[status()]" aria-hidden="true"></span>
    <div class="min-w-0 flex-1">
      <a class="chaotic-row__name" [href]="url()" target="_blank" rel="noopener">{{ mirror().subdomain }}.chaotic.cx</a>
      <span class="chaotic-row__meta">
        @if (mirror().latlon; as latlon) {
          <a
            class="hover:text-ctp-mauve"
            [routerLink]="['/map']"
            [queryParams]="{ focus: latlon.join(',') }"
            pTooltip="Show on the mirror map"
            tooltipPosition="top"
            >{{ formatLatLon(latlon) }}</a
          >
        } @else {
          Location unknown
        }
      </span>
    </div>
    <span class="flex shrink-0 items-center gap-2">
      @if (mirror().official) {
        <span class="mirror-badge" pTooltip="Run by the Chaotic-AUR operations team" tooltipPosition="top"
          >Official</span
        >
      }
      @if (mirror().geo_active) {
        <span class="mirror-badge" pTooltip="The GEO mirror routes requests to this mirror" tooltipPosition="top"
          >GEO</span
        >
      }
    </span>
    <span class="w-28 shrink-0 text-right text-xs text-ctp-subtext0 max-sm:hidden">
      @if (status() === 'offline') {
        Unreachable
      } @else {
        <span [pTooltip]="(mirror().last_update | date: 'short') ?? undefined" tooltipPosition="top">{{
          mirror().last_update | relativeTime
        }}</span>
      }
    </span>
  `,
  styles: `
    .mirror-badge {
      padding: 0.0625rem 0.4375rem;
      border: 1px solid var(--chaotic-border);
      border-radius: var(--chaotic-radius-sm);
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--ctp-mocha-subtext1);
    }
  `,
})
export class MirrorRowComponent {
  readonly mirror = input.required<Mirror>();
  readonly status = input.required<MirrorStatus>();

  protected readonly statusDotClasses = STATUS_DOT_CLASSES;
  protected readonly url = computed(() => `https://${this.mirror().subdomain}.chaotic.cx`);

  protected formatLatLon(latlon: readonly number[]): string {
    return latlon.map((value) => value.toFixed(COORDINATE_DECIMALS)).join(', ');
  }
}
