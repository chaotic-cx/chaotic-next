import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'logurl',
})
export class LogurlPipe implements PipeTransform {
  transform(value: string | undefined): string {
    if (value === 'purged') return value;

    return `<i class="pi pi-external-link text-mauve align-middle" style="font-size: 0.4rem !important;"> </i>
       <a pRipple href='${value}' target='_blank'> click</a>`;
  }
}
