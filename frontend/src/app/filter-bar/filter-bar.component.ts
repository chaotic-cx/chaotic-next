import { NgTemplateOutlet } from '@angular/common';
import { Component, contentChild, input, output, signal, TemplateRef } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Button } from '@openng/optimus-ui/button';
import { Drawer } from '@openng/optimus-ui/drawer';
import { isMobileSignal } from '../functions';

// Filters render inline on wide screens and in a bottom sheet on phones. The `#filters` template
// receives its placement (`inline` or `sheet`), so a page can add sheet-only controls.
@Component({
  selector: 'chaotic-filter-bar',
  imports: [NgTemplateOutlet, TranslocoDirective, Button, Drawer],
  templateUrl: './filter-bar.component.html',
  styleUrls: ['../empty-state/text-action.css', './filter-bar.component.css'],
})
export class FilterBarComponent {
  readonly active = input(false);
  readonly clear = output();

  protected readonly filters = contentChild.required<TemplateRef<unknown>>('filters');
  protected readonly isMobile = isMobileSignal();
  protected readonly sheetOpen = signal(false);

  protected clearFilters(): void {
    this.clear.emit();
    this.sheetOpen.set(false);
  }
}
