import { Pipe, PipeTransform } from '@angular/core';

const LABELS: Record<string, string> = {
  'lastUpdated': 'Last update',
  'id': 'ID',
  'pkgname': 'Package name',
  'createdAt': 'Added at',
  'version': 'Version',
  'deps': 'Dependencies',
  'desc': 'Description',
  'filename': 'Filename',
  'license': 'License',
  'packager': 'Packager',
  'url': 'URL',
  'buildDate': 'Build date',
  'checkDepends': 'Check dependencies',
  'conflicts': 'Conflicts',
  'makeDeps': 'Make dependencies',
  'optDeps': 'Optional dependencies',
  'provides': 'Provides',
  'replaces': 'Replaces',
  'soNameList': 'SO name list',
  'pkgrel': 'Pkgrel',
  'downloads': 'Downloads',
  'user-agents': 'User agents',
};

@Pipe({
  name: 'packageDetailKey',
})
export class PackageDetailKeyPipe implements PipeTransform {
  transform(value: string): string {
    return LABELS[value] ?? value;
  }
}
