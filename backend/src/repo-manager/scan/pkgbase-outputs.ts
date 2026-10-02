import { type Package } from '../../builder/builder.entity';

export function pkgbaseOf(pkg: Package): string {
  return pkg.pkgbaseName ?? pkg.pkgname;
}

export function groupByPkgbase(packages: Package[]): Map<string, Package[]> {
  const groups = new Map<string, Package[]>();
  for (const pkg of packages) {
    const group = groups.get(pkgbaseOf(pkg));
    if (group) {
      group.push(pkg);
    } else {
      groups.set(pkgbaseOf(pkg), [pkg]);
    }
  }

  return groups;
}

export function recordedDeps(pkg: Package): string[] | null {
  if (!pkg.metadata) return null;

  return pkg.metadata.deps ?? [];
}
