import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'duration',
})
export class DurationPipe implements PipeTransform {
  transform(duration: number | undefined): string {
    if (duration === undefined) {
      return 'unknown';
    }

    // Duration is measured in minutes, so convert it to hours, minutes, and seconds
    const hours = Math.floor(duration / 60);
    const minutes = duration.toFixed(0);
    const seconds = duration.toFixed(2).split('.')[1];
    return `${hours !== 0 ? `${hours}h` : ''} ${minutes !== '0' ? `${minutes}m` : ''} ${seconds}s`;
  }
}
