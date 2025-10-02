import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'repoName',
})
export class RepoNamePipe implements PipeTransform {
  transform(id?: number): string {
    switch (id) {
      case 1:
        return 'chaotic-aur';
      case 2:
        return 'garuda';
      default:
        return 'unknown';
    }
  }
}
