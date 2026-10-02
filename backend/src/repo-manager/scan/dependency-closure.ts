import { cleanDepName } from '../../diff-scan/srcinfo-dependency';

export interface DependencyRecord {
  pkgname: string;
  deps: string[];
  provides: string[];
}

export class DependencyClosure {
  private readonly recordsByName = new Map<string, DependencyRecord[]>();

  constructor(records: DependencyRecord[]) {
    for (const record of records) {
      this.register(record.pkgname, record);

      for (const provided of record.provides) {
        this.register(cleanDepName(provided), record);
      }
    }
  }

  /**
   * Names of every package that installing the given dependencies pulls in, transitively.
   */
  reachablePackages(deps: string[]): Set<string> {
    const reached = new Set<string>();
    const visitedNames = new Set<string>();
    const queue = deps.map(cleanDepName);
    while (queue.length > 0) {
      const name = queue.pop();
      if (name === undefined || visitedNames.has(name)) continue;

      visitedNames.add(name);

      for (const record of this.recordsByName.get(name) ?? []) {
        if (reached.has(record.pkgname)) continue;

        reached.add(record.pkgname);
        queue.push(...record.deps.map(cleanDepName));
      }
    }

    return reached;
  }

  private register(name: string, record: DependencyRecord): void {
    const records = this.recordsByName.get(name);
    if (records) {
      records.push(record);
    } else {
      this.recordsByName.set(name, [record]);
    }
  }
}
