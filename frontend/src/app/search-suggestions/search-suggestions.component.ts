import { Overlay, OverlayModule, OverlayRef, ScrollStrategyOptions } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, effect, inject, input, output, TemplateRef, ViewContainerRef, viewChild } from '@angular/core';

@Component({
  selector: 'chaotic-search-suggestions',
  imports: [OverlayModule],
  template: `
    <ng-template #suggestionPanel>
      <ul
        class="suggestion-list max-h-72 w-full overflow-y-auto rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg"
      >
        @for (suggestion of suggestions(); track suggestion) {
          <li>
            <button
              class="w-full cursor-pointer px-3 py-2 text-left text-ctp-text transition-colors hover:bg-ctp-surface0/60"
              (mousedown)="selectSuggestion.emit(suggestion)"
              type="button"
            >
              {{ suggestion }}
            </button>
          </li>
        }
      </ul>
    </ng-template>
  `,
})
export class SearchSuggestionsComponent {
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly scrollStrategy = inject(ScrollStrategyOptions).reposition();

  private readonly panelTemplate = viewChild<TemplateRef<unknown>>('suggestionPanel');

  readonly anchor = input<HTMLElement | null>(null);
  readonly suggestions = input<string[]>([]);
  readonly visible = input<boolean>(false);

  readonly selectSuggestion = output<string>();

  private overlayRef: OverlayRef | undefined;

  constructor() {
    effect(() => {
      if (this.visible() && this.anchor() && this.suggestions().length) {
        this.open();
      } else {
        this.close();
      }
    });
  }

  private open(): void {
    const anchor = this.anchor();
    const template = this.panelTemplate();
    if (!anchor || !template || this.overlayRef) return;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(anchor)
      .withPositions([
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
      ])
      .withFlexibleDimensions(false)
      .withPush(true);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.scrollStrategy,
      width: anchor.offsetWidth,
    });

    this.overlayRef.attach(new TemplatePortal(template, this.viewContainerRef));
    this.overlayRef.backdropClick().subscribe(() => this.close());
  }

  private close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }
}
