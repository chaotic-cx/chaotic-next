import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'chaotic-load-error',
  imports: [TranslocoDirective],
  template: `
    <div class="chaotic-card__empty flex-col text-center sm:flex-row" *transloco="let t" role="alert">
      <span class="inline-flex items-center gap-2">
        <i class="pi pi-exclamation-circle text-ctp-red" aria-hidden="true"></i>
        {{ message() ?? t('loadError.defaultMessage') }}
      </span>
      <button class="load-error__retry" (click)="retry.emit()" type="button">{{ t('common.tryAgain') }}</button>
    </div>
  `,
  styles: `
    .load-error__retry {
      padding: 0.25rem 0.625rem;
      border: 1px solid var(--chaotic-border);
      border-radius: var(--chaotic-radius-sm);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ctp-mocha-text);
      cursor: pointer;
      transition: border-color 120ms ease-out;
    }

    .load-error__retry:hover {
      border-color: var(--ctp-mocha-mauve);
    }
  `,
})
export class LoadErrorComponent {
  readonly message = input<string>();
  readonly retry = output();
}
