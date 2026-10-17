import { NgOptimizedImage } from '@angular/common';
import { Component, computed } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { lightLogo } from '../../logo';
import { injectActiveLanguage } from '../../pipes/active-language';
import { FASTFETCH_ROWS, formatFastfetchRows } from '../birthday-fastfetch';

const PALETTE = ['red', 'peach', 'yellow', 'green', 'teal', 'sky', 'blue', 'mauve'];

const TERMINAL = {
  command: 'fastfetch',
  user: 'chaotic',
  host: 'aur',
};

@Component({
  selector: 'chaotic-birthday-fastfetch',
  imports: [NgOptimizedImage, TranslocoDirective],
  templateUrl: './birthday-fastfetch.component.html',
  styleUrl: './birthday-fastfetch.component.css',
})
export class BirthdayFastfetchComponent {
  private readonly language = injectActiveLanguage();

  protected readonly palette = PALETTE;
  protected readonly terminal = TERMINAL;
  protected readonly lightLogo = lightLogo;
  protected readonly rows = computed(() => formatFastfetchRows(FASTFETCH_ROWS, this.language()));
}
