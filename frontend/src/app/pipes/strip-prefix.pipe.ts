import { inject, Pipe, PipeTransform } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({
  name: 'stripPrefix',
})
export class StripPrefixPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value?: string): string {
    if (!value) return '';
    const final = value.replace(/(^.*:\/\/|\/$)/g, '');

    // The URL is external input interpolated into raw HTML; sanitize the attribute.
    const href = this.sanitizer.sanitize(SecurityContext.HTML, `href="${value}"`);
    if (!href) return '';
    return `<a class="text-ctp-mauve" ${href}>${final}</a>`;
  }
}
