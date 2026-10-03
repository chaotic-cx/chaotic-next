import { Pipe, PipeTransform } from '@angular/core';
import { formatBytes } from '../functions';
import { MISSING_VALUE } from '../table-columns/missing-value';

@Pipe({
  name: 'bytes',
})
export class BytesPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return MISSING_VALUE;
    return formatBytes(Number(value));
  }
}
