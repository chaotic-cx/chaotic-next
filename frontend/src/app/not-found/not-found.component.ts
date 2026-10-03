import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-not-found',
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
  imports: [RouterLink, TitleComponent, TranslocoDirective],
})
export class NotFoundComponent {}
