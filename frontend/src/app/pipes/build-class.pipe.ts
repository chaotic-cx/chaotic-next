import { Pipe, PipeTransform } from '@angular/core';
import { buildClassTierName } from '@chaotic-next/shared-lib';

@Pipe({
  name: 'buildClass',
})
export class BuildClassPipe implements PipeTransform {
  transform(value: null | number | string): string {
    if (value === null) return 'Custom';
    if (typeof value === 'string') return value;
    return `${value} (${buildClassTierName(value)})`;
  }
}
