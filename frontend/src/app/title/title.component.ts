import { Component, input } from '@angular/core';

@Component({
  selector: 'chaotic-title',
  imports: [],
  templateUrl: './title.component.html',
  styleUrl: './title.component.css',
})
export class TitleComponent {
  title = input<string>();
  subtitle = input<string>();
  subtitleHtml = input<string>();
}
