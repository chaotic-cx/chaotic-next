import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'packageDetailKey',
})
export class PackageDetailKeyPipe implements PipeTransform {
  transform(value: string): string {
    switch (value) {
      case 'lastUpdated':
        return 'Last update';
      case 'id':
        return 'ID';
      case 'pkgname':
        return 'Package name';
      case 'version':
        return 'Version';
      case 'deps':
        return 'Dependencies';
      case 'desc':
        return 'Description';
      case 'filename':
        return 'Filename';
      case 'license':
        return 'License';
      case 'packager':
        return 'Packager';
      case 'url':
        return 'URL';
      case 'buildDate':
        return 'Build date';
      case 'checkDepends':
        return 'Check dependencies';
      case 'conflicts':
        return 'Conflicts';
      case 'makeDeps':
        return 'Make dependencies';
      case 'optDeps':
        return 'Optional dependencies';
      case 'provides':
        return 'Provides';
      case 'replaces':
        return 'Replaces';
      case 'soNameList':
        return 'SO name list';
      case 'pkgrel':
        return 'Pkgrel';
      case 'downloads':
        return 'Downloads';
      case 'user-agents':
        return 'User agents';
      default:
        return value;
    }
  }
}
