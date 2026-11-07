import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LOG_RETENTION_MS } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';

/**
 * Lifecycle of a streamed build log.
 * `connecting`: no line arrived yet. `live`: lines arrive. `reconnecting`: the link dropped and comes back.
 * `failed`: every reconnect failed. `complete`: the log ended. `empty`: the log ended without a line.
 * `purged`: the log ended without a line, and the build is older than the log retention.
 * `unavailable`: the build has no stored log.
 */
export type LogStreamState =
  'connecting' | 'live' | 'reconnecting' | 'failed' | 'complete' | 'empty' | 'purged' | 'unavailable';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOG_RETENTION_DAYS = Math.round(LOG_RETENTION_MS / MS_PER_DAY);

@Component({
  selector: 'chaotic-log-stream-status',
  imports: [LoadErrorComponent, TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'logStream'">
      <!-- The region stays in the DOM, so screen readers announce each state change. -->
      <div role="status">
        @switch (state()) {
          @case ('reconnecting') {
            <p class="log-stream-status chaotic-text-inset log-stream-status--warn">
              <i class="pi pi-wifi" aria-hidden="true"></i>
              {{ t('reconnecting') }}
            </p>
          }
          @case ('empty') {
            <p class="log-stream-status chaotic-text-inset">{{ t('empty') }}</p>
          }
          @case ('purged') {
            <p class="log-stream-status chaotic-text-inset">{{ t('purged', { days: retentionDays }) }}</p>
          }
          @case ('unavailable') {
            <p class="log-stream-status chaotic-text-inset">{{ t('unavailable') }}</p>
          }
          @default {
            <!-- A connecting, live, complete or failed log needs no status line. -->
          }
        }
      </div>

      @if (state() === 'failed') {
        <chaotic-load-error [message]="t('failed')" (retry)="retry.emit()" />
      }
    </ng-container>
  `,
  styles: `
    .log-stream-status {
      display: flex;
      align-items: center;
      gap: var(--chaotic-space-sm);
      font-size: var(--chaotic-text-base);
      color: var(--chaotic-fg-muted);
    }

    /* Spacing comes from the content, so an empty status adds no gap above the log panel. */
    .log-stream-status,
    chaotic-load-error {
      margin-bottom: var(--chaotic-space-md);
    }

    chaotic-load-error {
      display: block;
    }

    .log-stream-status--warn {
      color: var(--chaotic-ink-yellow);
    }
  `,
})
export class LogStreamStatusComponent {
  readonly state = input.required<LogStreamState>();
  readonly retry = output();

  protected readonly retentionDays = LOG_RETENTION_DAYS;
}
