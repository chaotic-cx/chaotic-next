import { Component, input, output } from '@angular/core';

@Component({
  selector: 'chaotic-load-error',
  template: `
    <div class="chaotic-card__empty flex-col text-center sm:flex-row" role="alert">
      <span class="inline-flex items-center gap-2">
        <i class="pi pi-exclamation-circle text-ctp-red" aria-hidden="true"></i>
        {{ message() }}
      </span>
      <button class="load-error__retry" (click)="retry.emit()" type="button">Try again</button>
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
  readonly message = input('Could not load this data.');
  readonly retry = output();
}
