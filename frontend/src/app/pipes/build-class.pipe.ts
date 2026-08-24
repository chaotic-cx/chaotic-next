import { Pipe, PipeTransform } from '@angular/core';
import { buildClassLabel } from '@chaotic-next/shared-lib';

@Pipe({
  name: 'buildClass',
})
export class BuildClassPipe implements PipeTransform {
  transform(value: null | number | string): string {
    if (value === null) return 'Custom';
    return buildClassLabel(value);
  }
}
