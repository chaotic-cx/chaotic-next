import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MenuItem } from '@openng/optimus-ui/api';
import { AuthButtonComponent } from '../auth/auth-button.component';

@Component({
  selector: 'chaotic-mobile-nav',
  imports: [RouterLink, AuthButtonComponent],
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.css',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class MobileNavComponent {
  readonly items = input.required<MenuItem[]>();
  readonly visible = input(false);
  readonly closed = output();

  protected onEscape(): void {
    this.closed.emit();
  }
}
