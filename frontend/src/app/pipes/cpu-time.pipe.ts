import { Pipe, PipeTransform } from '@angular/core';
import { formatCpuTime } from '../functions';

@Pipe({
  name: 'cpuTime',
})
export class CpuTimePipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return 'n/a';
    return formatCpuTime(Number(value));
  }
}
