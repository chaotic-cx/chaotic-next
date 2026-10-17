import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { injectSlowLoading } from '../table-skeleton/skeleton-timing';

/**
 * Tells the user that a request is still running after it takes unusually long.
 * Place it next to a skeleton that is not a table or a list skeleton.
 * It stays empty until the slow-loading timeout passes.
 */
@Component({
  selector: 'chaotic-slow-loading-hint',
  imports: [TranslocoDirective],
  template: `
    <p class="chaotic-slow-hint" *transloco="let t" role="status">
      @if (slow()) {
        {{ t('tableSkeleton.stillLoading') }}
      }
    </p>
  `,
})
export class SlowLoadingHintComponent {
  protected readonly slow = injectSlowLoading();
}
