import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Reset link for a table toolbar. It shows only while a filter or search is active.
 */
@Component({
  selector: 'chaotic-clear-filters',
  imports: [TranslocoDirective],
  template: `
    @if (active()) {
      <button class="text-action" *transloco="let t" (click)="clear.emit()" type="button">
        {{ t('common.clearFilters') }}
      </button>
    }
  `,
  styleUrls: ['./text-action.css'],
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class ClearFiltersComponent {
  readonly active = input(false);
  readonly clear = output();
}
