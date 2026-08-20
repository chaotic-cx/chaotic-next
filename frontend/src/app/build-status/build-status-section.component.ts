import { Component, input } from '@angular/core';

@Component({
  selector: 'chaotic-build-status-section',
  template: `
    <div class="mb-4 flex items-center justify-center gap-3 border-b border-ctp-surface0 pb-3 lg:justify-start">
      <i class="pi {{ icon() }} {{ iconClass() }} text-lg leading-none"></i>
      <div class="min-w-0">
        <h2 class="font-semibold leading-none">{{ title() }}</h2>
        @if (subtitle(); as subtitle) {
          <p class="mt-1 text-sm text-ctp-subtext1">{{ subtitle }}</p>
        }
      </div>
    </div>
  `,
})
export class BuildStatusSectionComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly icon = input.required<string>();
  readonly iconClass = input('');
}
