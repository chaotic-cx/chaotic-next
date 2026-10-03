import { Component, effect, ElementRef, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { MenuItem } from '@openng/optimus-ui/api';
import { AuthButtonComponent } from '../auth/auth-button.component';

@Component({
  selector: 'chaotic-mobile-nav',
  imports: [RouterLink, AuthButtonComponent, TranslocoDirective],
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.css',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class MobileNavComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input.required<MenuItem[]>();
  readonly visible = input(false);
  readonly closed = output();

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      // The menu renders in the same change detection pass; focus it once it is in the DOM.
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.mobile-nav__link')?.focus());
    });
  }

  protected onEscape(): void {
    if (this.visible()) this.closed.emit();
  }
}
