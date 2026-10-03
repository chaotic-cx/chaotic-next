import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Empty table or list state. The message input or the projected content says why the list is empty.
 * A filtered empty state offers to clear the filters. A first-run empty state
 * shows the optional hint and any projected [emptyStateAction] element instead.
 */
@Component({
  selector: 'chaotic-empty-state',
  imports: [TranslocoDirective],
  template: `
    <div class="chaotic-card__empty flex-col text-center" *transloco="let t" role="status">
      <div class="empty-state__message">
        @if (icon(); as iconName) {
          <i class="pi {{ iconName }}" aria-hidden="true"></i>
        }
        @if (message(); as messageText) {
          <span>{{ messageText }}</span>
        }
        <ng-content />
      </div>
      @if (filtered()) {
        <button class="text-action" (click)="clearFilters.emit()" type="button">{{ t('common.clearFilters') }}</button>
      } @else {
        @if (hint(); as hintText) {
          <p class="empty-state__hint">{{ hintText }}</p>
        }
        <ng-content select="[emptyStateAction]" />
      }
    </div>
  `,
  styleUrls: ['./text-action.css'],
  styles: `
    .empty-state__message {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--catppuccin-color-subtext1);
    }

    .empty-state__hint {
      max-width: 40rem;
      font-size: 0.8125rem;
      color: var(--chaotic-fg-muted);
    }
  `,
})
export class EmptyStateComponent {
  readonly message = input<string>();
  readonly icon = input<string>();
  readonly filtered = input(false);
  readonly hint = input<string>();
  readonly clearFilters = output();
}
