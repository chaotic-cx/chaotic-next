import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { MISSING_VALUE } from '../table-columns/missing-value';

/**
 * Shows an em dash for a metric that is unknown, still loading or failed to load.
 * Screen readers hear a word instead of the dash.
 */
@Component({
  selector: 'chaotic-unknown-value',
  imports: [TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <span aria-hidden="true">{{ missingValue }}</span>
      <span class="sr-only">{{ t('uiStates.unknownValue') }}</span>
    </ng-container>
  `,
})
export class UnknownValueComponent {
  protected readonly missingValue = MISSING_VALUE;
}
