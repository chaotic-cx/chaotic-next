import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TitleComponent } from '../title/title.component';

@Component({
  selector: 'chaotic-not-found',
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.css',
  imports: [TitleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
