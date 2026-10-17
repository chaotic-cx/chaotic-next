import { Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { injectSlowLoading } from './skeleton-timing';

const DEFAULT_SKELETON_ROWS = 5;

/**
 * Placeholder lines for a card list (chaotic-mini-list) during its first load.
 * Like the table skeleton, it reserves its space at once and fades in after a short delay.
 */
@Component({
  selector: 'chaotic-skeleton-list',
  imports: [TranslocoDirective],
  template: `
    <ul class="chaotic-mini-list skeleton-reveal" *transloco="let t">
      @for (row of rowIndexes(); track row) {
        <li [attr.aria-hidden]="row !== 0">
          @if (row === 0 && slow()) {
            <span class="skeleton-slow-note" role="status">{{ t('tableSkeleton.stillLoading') }}</span>
          } @else {
            <span class="chaotic-skeleton h-4 w-full"></span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class SkeletonListComponent {
  readonly rows = input(DEFAULT_SKELETON_ROWS);

  protected readonly slow = injectSlowLoading();

  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (unused, index) => index));
}
