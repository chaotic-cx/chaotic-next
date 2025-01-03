import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'stripPrefix',
})
export class StripPrefixPipe implements PipeTransform {
  transform(value?: string): string | undefined {
    let final: string;
    if (!value) return;
    final = value.replace(/(^.*:\/\/|\/$)/g, '');
    return `<a class="text-mauve" href="${value}">${final}</a>`;
  }
}
