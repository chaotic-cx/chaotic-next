import { Package } from '@./shared-lib';
import { Service, signal } from '@angular/core';

@Service()
export class PackageListService {
  readonly packageList = signal<(Package & { reponame: string })[]>([]);
  readonly searchValue = signal<string>('');
  readonly loading = signal<boolean>(true);
}
