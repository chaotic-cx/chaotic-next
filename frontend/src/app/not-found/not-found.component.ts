import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-not-found',
  imports: [RouterLink, TitleComponent, TranslocoDirective],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
})
export class NotFoundComponent {}
