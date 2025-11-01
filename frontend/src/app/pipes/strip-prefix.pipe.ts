import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'stripPrefix',
})
export class StripPrefixPipe implements PipeTransform {
  transform(value?: string): string | undefined {
    if (!value) return;
    const final = value.replace(/(^.*:\/\/|\/$)/g, '');
    return `<a class="text-ctp-mauve" href="${value}">${final}</a>`;
  }
}
