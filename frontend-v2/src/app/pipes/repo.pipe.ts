import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'repo',
  standalone: true,
})
export class RepoPipe implements PipeTransform {
  transform(value: string): string {
    switch (value) {
      case 'chaotic-aur':
        return 'Chaotic-AUR';
      case 'all':
        return 'All';
      case 'garuda':
        return 'Garuda';
      default:
        return value;
    }
  }
}
