import { Component, input } from '@angular/core';

@Component({
  selector: 'chaotic-build-status-section',
  host: { class: 'contents' },
  template: `
    <header class="chaotic-card__header">
      <i class="pi {{ icon() }} {{ iconClass() }} text-sm" aria-hidden="true"></i>
      <h2 class="chaotic-card__title">{{ title() }}</h2>
      @if (count() !== undefined) {
        <span class="chaotic-card__count">{{ count() }}</span>
      }
      <div class="ml-auto flex items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class BuildStatusSectionComponent {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  readonly iconClass = input('text-ctp-subtext0');
  readonly count = input<number>();
}
