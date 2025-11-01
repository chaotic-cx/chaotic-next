import { Injectable, signal } from '@angular/core';
import { Package } from '@./shared-lib';

@Injectable({
  providedIn: 'root',
})
export class PackageListService {
  readonly packageList = signal<(Package & { reponame: string })[]>([]);
  readonly searchValue = signal<string>('');
  readonly loading = signal<boolean>(true);
}
