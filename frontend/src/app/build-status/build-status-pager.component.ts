/* eslint-disable @angular-eslint/prefer-signal-model -- pager uses explicit input/output for clamped pagination */
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'chaotic-build-status-pager',
  templateUrl: './build-status-pager.component.html',
})
export class BuildStatusPager {
  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly pageChange = output<number>();

  goTo(page: number): void {
    this.pageChange.emit(Math.min(Math.max(1, page), this.pageCount()));
  }
}
