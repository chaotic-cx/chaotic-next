import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'logurl',
})
export class LogurlPipe implements PipeTransform {
  transform(value: string | undefined): string {
    if (value === 'purged') return value;
    return `<a href='${value}' class='pi pi-external-link'  target='_blank'> click</a>`;
  }
}
