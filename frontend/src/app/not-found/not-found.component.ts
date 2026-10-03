import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-not-found',
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
  imports: [TitleComponent, TranslocoDirective],
})
export class NotFoundComponent {}
