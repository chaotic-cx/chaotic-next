import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AppService } from '../app.service';

/**
 * Says that live updates are paused while the build event stream reconnects.
 * The data on the page stays visible, but it can be out of date.
 * Nothing shows before the first connection attempt settles.
 */
@Component({
  selector: 'chaotic-stale-notice',
  imports: [TranslocoDirective],
  template: `
    <span *transloco="let t" role="status">
      @if (paused()) {
        <span class="chaotic-stale-notice">
          <span class="chaotic-stale-notice__dot" aria-hidden="true"></span>
          {{ t('uiStates.liveUpdatesPaused') }}
        </span>
      }
    </span>
  `,
})
export class StaleNoticeComponent {
  private readonly appService = inject(AppService);

  protected readonly paused = computed(() => this.appService.sseSettled() && !this.appService.sseConnected());
}
