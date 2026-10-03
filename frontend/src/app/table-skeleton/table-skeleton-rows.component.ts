import { Component, computed, input } from '@angular/core';

const DEFAULT_SKELETON_ROWS = 5;

/**
 * Placeholder rows for a table body during its first load. The host uses
 * display: contents, so the rows sit directly in the table body. Each row
 * takes the measured height of a loaded row, so the table does not jump.
 */
@Component({
  selector: 'chaotic-table-skeleton-rows',
  template: `
    @for (row of rowIndexes(); track row) {
      <tr class="skeleton-row" [style.height.px]="rowHeight()" aria-hidden="true">
        <td class="skeleton-cell" [attr.colspan]="columns()"><span class="chaotic-skeleton block h-5"></span></td>
      </tr>
    }
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

  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (unused, index) => index));
}
