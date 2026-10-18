import { Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { SKELETON_REVEAL_DELAY_MS, SLOW_LOADING_AFTER_MS } from '../table-skeleton/skeleton-timing';
import { delayedFlag } from '../utils/delayed-flag';
import { LogStreamState } from './log-stream-status.component';

@Component({
  selector: 'chaotic-log-stream-connecting',
  imports: [TranslocoDirective],
  template: `
    <ng-container *transloco="let t; prefix: 'logStream'">
      <!-- The region stays in the DOM, so screen readers announce the connecting state. -->
      <span role="status">
        @if (showConnecting()) {
          <i
            class="pi pi-spinner pi-spin log-stream-connecting"
            [title]="showSlowHint() ? t('slow') : t('connecting')"
            aria-hidden="true"
          ></i>
          <span class="sr-only">{{ showSlowHint() ? t('slow') : t('connecting') }}</span>
        }
      </span>
    </ng-container>
  `,
  styles: `
    .log-stream-connecting {
      font-size: var(--chaotic-text-md);
      color: var(--chaotic-fg-muted);
    }
  `,
})
export class LogStreamConnectingComponent {
  readonly state = input.required<LogStreamState>();

  private readonly connecting = computed(() => this.state() === 'connecting');
  protected readonly showConnecting = delayedFlag(this.connecting, SKELETON_REVEAL_DELAY_MS);
  protected readonly showSlowHint = delayedFlag(this.connecting, SLOW_LOADING_AFTER_MS);
}
