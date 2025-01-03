import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'unixDate',
})
export class UnixDatePipe implements PipeTransform {
  transform(value: number): unknown {
    const date = new Date(value * 1000);
    return date.toLocaleString('en-GB');
  }
}
