import { inject, Pipe, PipeTransform } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({
  name: 'logurl',
})
export class LogurlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | undefined): string {
    if (!value) return '';
    if (value === 'purged') return value;

    // The URL is external input interpolated into raw HTML; sanitize the attribute.
    const href = this.sanitizer.sanitize(SecurityContext.HTML, `href='${value}'`);
    if (!href) return '';
    return `<i class="pi pi-external-link text-ctp-mauve align-middle" style="font-size: 0.4rem !important;"> </i>
       <a pRipple ${href} target='_blank'> click</a>`;
  }
}
