import { Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LOG_RETENTION_MS } from '../functions';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { SKELETON_REVEAL_DELAY_MS, SLOW_LOADING_AFTER_MS } from '../table-skeleton/skeleton-timing';
import { delayedFlag } from '../utils/delayed-flag';

/**
 * Lifecycle of a streamed build log.
 * `connecting`: no line arrived yet. `live`: lines arrive. `reconnecting`: the link dropped and comes back.
 * `failed`: every reconnect failed. `complete`: the log ended. `empty`: the log ended without a line.
 * `purged`: the log ended without a line, and the build is older than the log retention.
 */
export type LogStreamState = 'connecting' | 'live' | 'reconnecting' | 'failed' | 'complete' | 'empty' | 'purged';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOG_RETENTION_DAYS = Math.round(LOG_RETENTION_MS / MS_PER_DAY);

/**
 * One status line above a log terminal. It stays empty while the log streams normally.
 */
@Component({
  selector: 'chaotic-log-stream-status',
  imports: [LoadErrorComponent, TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'logStream'">
      <!-- The region stays in the DOM, so screen readers announce each state change. -->
      <div role="status">
        @switch (state()) {
          @case ('connecting') {
            @if (showConnecting()) {
              <p class="log-stream-status">
                <i class="pi pi-spinner pi-spin" aria-hidden="true"></i>
                {{ showSlowHint() ? t('slow') : t('connecting') }}
              </p>
            }
          }
          @case ('reconnecting') {
            <p class="log-stream-status log-stream-status--warn">
              <i class="pi pi-wifi" aria-hidden="true"></i>
              {{ t('reconnecting') }}
            </p>
          }
          @case ('empty') {
            <p class="log-stream-status">{{ t('empty') }}</p>
          }
          @case ('purged') {
            <p class="log-stream-status">{{ t('purged', { days: retentionDays }) }}</p>
          }
          @default {
            <!-- A live, complete or failed log needs no status line. -->
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
      padding-inline: var(--chaotic-space-sm);
      font-size: var(--chaotic-text-base);
      color: var(--chaotic-fg-muted);
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

  private readonly connecting = computed(() => this.state() === 'connecting');
  protected readonly showConnecting = delayedFlag(this.connecting, SKELETON_REVEAL_DELAY_MS);
  protected readonly showSlowHint = delayedFlag(this.connecting, SLOW_LOADING_AFTER_MS);
}
