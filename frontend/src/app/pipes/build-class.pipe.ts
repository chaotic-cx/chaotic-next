import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'buildClass',
  standalone: true,
})
export class BuildClassPipe implements PipeTransform {
  transform(value: null | number): unknown {
    switch (value) {
      case 0:
        return '0 (None)';
      case 1:
        return '1 (None)';
      case 2:
        return '2 (Light)';
      case 3:
        return '3 (Light)';
      case 4:
        return '4 (Light)';
      case 5:
        return '5 (Medium)';
      case 6:
        return '6 (Medium)';
      case 7:
        return '7 (Heavy)';
      case 8:
        return '8 (Heavy)';
      case 9:
        return '9 (Very Heavy)';
      case 10:
        return '10 (Very Heavy)';
      case null:
        return 'Custom';
      default:
        return value;
    }
  }
}
