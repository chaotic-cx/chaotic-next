import { Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { injectSlowLoading } from './skeleton-timing';

const DEFAULT_SKELETON_ROWS = 5;

/**
 * Placeholder rows for a table body during its first load. The host uses
 * display: contents, so the rows sit directly in the table body. Each row
 * takes the measured height of a loaded row, so the table does not jump.
 * The rows reserve their space at once but fade in after a short delay.
 * When the request is slow, the first row tells the user so.
 */
@Component({
  selector: 'chaotic-table-skeleton-rows',
  imports: [TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      @for (row of rowIndexes(); track row) {
        <tr class="skeleton-row skeleton-reveal" [style.height.px]="rowHeight()" [attr.aria-hidden]="row !== 0">
          <td class="skeleton-cell" [attr.colspan]="columns()">
            @if (row === 0 && slow()) {
              <span class="skeleton-slow-note" role="status">{{ t('tableSkeleton.stillLoading') }}</span>
            } @else {
              <span class="chaotic-skeleton block h-5"></span>
            }
          </td>
        </tr>
      }
    </ng-container>
  `,
  styles: `
    :host {
      display: contents;
    }

    .skeleton-row {
      box-sizing: border-box;
    }

    .skeleton-cell {
      padding: 0 0.75rem;
      vertical-align: middle;
      border-bottom: 1px solid var(--p-datatable-body-cell-border-color);
    }
  `,
})
export class TableSkeletonRowsComponent {
  readonly rows = input(DEFAULT_SKELETON_ROWS);
  readonly columns = input.required<number>();
  readonly rowHeight = input.required<number>();

  protected readonly slow = injectSlowLoading();

  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (unused, index) => index));
}
