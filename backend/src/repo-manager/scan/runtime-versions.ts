import { In, type Repository } from 'typeorm';
import { ArchlinuxPackage } from '../repo-manager.entity';
import type { RuntimeName } from '../signal';

const RUNTIME_NAMES = ['python', 'perl', 'ruby', 'ghc'] as const satisfies RuntimeName[];

const RUNTIME_NAME_BY_PKGNAME = new Map<string, RuntimeName>(RUNTIME_NAMES.map((name) => [name, name]));

export async function loadRuntimeVersions(
  archlinuxPackageRepository: Repository<ArchlinuxPackage>,
): Promise<Partial<Record<RuntimeName, string | null>>> {
  const rows = await archlinuxPackageRepository.find({ where: { pkgname: In(RUNTIME_NAMES) } });
  const versions: Partial<Record<RuntimeName, string | null>> = {};
  for (const row of rows) {
    const runtime = RUNTIME_NAME_BY_PKGNAME.get(row.pkgname);
    if (runtime) versions[runtime] = row.version ?? null;
  }
  return versions;
}
