import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Button } from '@openng/optimus-ui/button';

/**
 * Inline notice in an edit dialog when the record changed after the dialog opened.
 */
@Component({
  selector: 'chaotic-edit-conflict-notice',
  imports: [Button, TranslocoDirective],
  template: `
    <div
      class="flex flex-wrap items-center gap-3 rounded-(--chaotic-radius-md) border border-ctp-yellow/40 bg-ctp-yellow/10 px-3 py-2 text-sm text-ctp-text"
      *transloco="let t"
      role="alert"
    >
      <i class="pi pi-exclamation-triangle text-ctp-yellow" aria-hidden="true"></i>
      <span class="min-w-0 flex-1">{{ t(messageKey()) }}</span>
      <div class="flex flex-wrap justify-end gap-2">
        <p-button
          [label]="t('admin.editConflict.review')"
          (onClick)="review.emit()"
          type="button"
          severity="secondary"
          size="small"
        />
        <p-button
          [label]="t('admin.editConflict.saveAnyway')"
          (onClick)="saveAnyway.emit()"
          type="button"
          severity="warn"
          size="small"
        />
      </div>
    </div>
  `,
})
export class EditConflictNoticeComponent {
  readonly messageKey = input.required<string>();
  readonly review = output();
  readonly saveAnyway = output();
}
