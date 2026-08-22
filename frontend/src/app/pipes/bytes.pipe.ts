import { Pipe, PipeTransform } from '@angular/core';
import { formatBytes } from '../functions';

@Pipe({
  name: 'bytes',
})
export class BytesPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return 'n/a';
    return formatBytes(Number(value));
  }
}
