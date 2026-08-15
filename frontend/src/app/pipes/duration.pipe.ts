import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'duration',
})
export class DurationPipe implements PipeTransform {
  transform(duration: number | undefined): string {
    if (!duration) {
      return 'n/a';
    }

    // duration is in minutes
    const hours = Math.floor(duration / 60);
    const minutes = Math.floor(duration % 60);
    return `${hours !== 0 ? `${hours}h` : ''} ${minutes !== 0 ? `${minutes}m` : ''}`.trim() || '0m';
  }
}
