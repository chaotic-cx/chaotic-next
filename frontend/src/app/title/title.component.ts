import { Component, input } from '@angular/core';

@Component({
  selector: 'chaotic-title',
  imports: [],
  templateUrl: './title.component.html',
  styleUrl: './title.component.css',
})
export class TitleComponent {
  readonly title = input<string>();
  readonly subtitle = input<string>();
  readonly subtitleHtml = input<string>();
}
