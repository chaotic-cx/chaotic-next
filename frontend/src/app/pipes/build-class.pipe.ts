import { Pipe, PipeTransform } from '@angular/core';

const BUILD_CLASS_LABELS: Record<number, string> = {
  0: '0 (None)',
  1: '1 (None)',
  2: '2 (Light)',
  3: '3 (Light)',
  4: '4 (Light)',
  5: '5 (Medium)',
  6: '6 (Medium)',
  7: '7 (Heavy)',
  8: '8 (Heavy)',
  9: '9 (Very Heavy)',
  10: '10 (Very Heavy)',
};

@Pipe({
  name: 'buildClass',
})
export class BuildClassPipe implements PipeTransform {
  transform(value: null | number): string {
    if (value === null) return 'Custom';
    return BUILD_CLASS_LABELS[value] ?? String(value);
  }
}
